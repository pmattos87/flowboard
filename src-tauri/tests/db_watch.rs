//! QA (FB-127): extra database-safety checks for the live-refresh watcher.
//! Temp databases only; never the real app database.

use flowboard_lib::db::open_and_migrate;
use flowboard_lib::db::watch::DbWatcher;
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{ConnectOptions, Connection};
use std::path::PathBuf;
use std::str::FromStr;

fn temp_db(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "flowboard-watch-qa-{name}-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir.join("flowboard.db")
}

fn url(path: &PathBuf, mode: &str) -> String {
    format!(
        "sqlite://{}?mode={mode}",
        path.to_string_lossy().replace('\\', "/")
    )
}

const WRITE: &str = "INSERT INTO people (name, email) VALUES ('w', 'w@x')";

/// Negative control for `watcher_does_not_block_writers_or_checkpoints`: a
/// connection that keeps a read transaction open DOES make the checkpoint report
/// busy = 1. So the builder's busy = 0 assertion is sensitive to a held read lock.
#[tokio::test]
async fn held_read_transaction_makes_checkpoint_busy() {
    let path = temp_db("control");
    let pool = open_and_migrate(&path).await.unwrap();
    let mut reader = SqliteConnectOptions::from_str(&url(&path, "rw"))
        .unwrap()
        .busy_timeout(std::time::Duration::from_millis(200))
        .connect()
        .await
        .unwrap();
    sqlx::query("BEGIN").execute(&mut reader).await.unwrap();
    let _: i64 = sqlx::query_scalar("PRAGMA data_version")
        .fetch_one(&mut reader)
        .await
        .unwrap();
    sqlx::query(WRITE).execute(&pool).await.unwrap();

    let (busy, _, _): (i64, i64, i64) = sqlx::query_as("PRAGMA wal_checkpoint(TRUNCATE)")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(busy, 1, "control: a held read transaction must block TRUNCATE");
    sqlx::query("COMMIT").execute(&mut reader).await.unwrap();
}

/// Repeated ticks interleaved with writes never leave a read lock behind.
#[tokio::test]
async fn checkpoint_not_busy_after_many_ticks() {
    let path = temp_db("many");
    let pool = open_and_migrate(&path).await.unwrap();
    let mut watcher = DbWatcher::open(&path).await.unwrap();
    let mut calls = 0;
    for _ in 0..5 {
        sqlx::query(WRITE).execute(&pool).await.unwrap();
        assert!(watcher.check(&mut || calls += 1).await.unwrap());
        let (busy, _, _): (i64, i64, i64) =
            sqlx::query_as("PRAGMA wal_checkpoint(TRUNCATE)")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(busy, 0);
    }
    assert_eq!(calls, 5);
}

/// Opening the watcher on a rollback-journal (DELETE mode) database leaves it in
/// DELETE mode and creates no -wal file: the watcher sets no journal_mode at all
/// (on a WAL db, setting WAL would be invisible). LESSONS SF-2.
#[tokio::test]
async fn watcher_does_not_switch_a_delete_mode_db_to_wal() {
    let path = temp_db("delete");
    {
        let mut c = SqliteConnectOptions::from_str(&url(&path, "rwc"))
            .unwrap()
            .connect()
            .await
            .unwrap();
        sqlx::query("CREATE TABLE t (x INTEGER)")
            .execute(&mut c)
            .await
            .unwrap();
        c.close().await.unwrap();
    }
    let mut watcher = DbWatcher::open(&path).await.unwrap();
    watcher.check(&mut || {}).await.unwrap();

    let mut c = SqliteConnectOptions::from_str(&url(&path, "rw"))
        .unwrap()
        .connect()
        .await
        .unwrap();
    let mode: String = sqlx::query_scalar("PRAGMA journal_mode")
        .fetch_one(&mut c)
        .await
        .unwrap();
    assert_eq!(mode, "delete");
    let mut wal = path.clone().into_os_string();
    wal.push("-wal");
    assert!(!PathBuf::from(wal).exists());
}

/// A missing parent directory also fails without creating anything.
#[tokio::test]
async fn missing_directory_fails_and_creates_nothing() {
    let dir = temp_db("nodir").parent().unwrap().join("absent");
    let path = dir.join("flowboard.db");
    assert!(DbWatcher::open(&path).await.is_err());
    assert!(!dir.exists());
}
