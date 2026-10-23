//! Live-refresh signal: notices when another connection commits to the app
//! database (the CLI/MCP, or the app's own pool) via `PRAGMA data_version`.
//!
//! Database safety: the watcher opens one plain connection to the existing file
//! (mode `rw`, never `rwc`), sets no `journal_mode`/`foreign_keys` option and runs
//! no migrations (sqlx applies connect options as side effects, see LESSONS SF-2).
//! It only runs `PRAGMA data_version` in autocommit: no transaction and no
//! statement kept open between ticks, so it never blocks writers or checkpoints.

use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{ConnectOptions, SqliteConnection};
use std::path::Path;
use std::str::FromStr;
use std::time::Duration;

const POLL_INTERVAL: Duration = Duration::from_secs(1);

pub struct DbWatcher {
    conn: SqliteConnection,
    last: i64,
}

impl DbWatcher {
    /// Connect to an existing, already migrated database.
    pub async fn open(path: &Path) -> Result<Self, String> {
        let url = format!(
            "sqlite://{}?mode=rw",
            path.to_string_lossy().replace('\\', "/")
        );
        let mut conn = SqliteConnectOptions::from_str(&url)
            .map_err(|e| e.to_string())?
            .connect()
            .await
            .map_err(|e| format!("failed to open watcher connection: {e}"))?;
        let last = data_version(&mut conn).await?;
        Ok(Self { conn, last })
    }

    /// One tick: true (and `on_change` called once) when another connection
    /// committed since the previous check.
    pub async fn check(&mut self, on_change: &mut impl FnMut()) -> Result<bool, String> {
        let current = data_version(&mut self.conn).await?;
        if current == self.last {
            return Ok(false);
        }
        self.last = current;
        on_change();
        Ok(true)
    }
}

async fn data_version(conn: &mut SqliteConnection) -> Result<i64, String> {
    sqlx::query_scalar("PRAGMA data_version")
        .fetch_one(conn)
        .await
        .map_err(|e| format!("PRAGMA data_version failed: {e}"))
}

/// Poll forever, calling `on_change` when the database changes. A failed open is
/// logged and the watcher stops; the app keeps working without live refresh.
pub async fn run(path: &Path, mut on_change: impl FnMut()) {
    let mut watcher = match DbWatcher::open(path).await {
        Ok(w) => w,
        Err(e) => {
            eprintln!("db watcher disabled: {e}");
            return;
        }
    };
    loop {
        tokio::time::sleep(POLL_INTERVAL).await;
        if let Err(e) = watcher.check(&mut on_change).await {
            eprintln!("db watcher check failed: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_and_migrate;
    use std::path::PathBuf;

    fn temp_db(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "flowboard-watch-test-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("flowboard.db")
    }

    const WRITE: &str = "INSERT INTO people (name, email) VALUES ('w', 'w@x')";

    #[tokio::test]
    async fn pool_commit_is_reported_once() {
        let path = temp_db("commit");
        let pool = open_and_migrate(&path).await.unwrap();
        let mut watcher = DbWatcher::open(&path).await.unwrap();
        let mut calls = 0;

        sqlx::query(WRITE).execute(&pool).await.unwrap();
        assert!(watcher.check(&mut || calls += 1).await.unwrap());
        assert_eq!(calls, 1);
        assert!(!watcher.check(&mut || calls += 1).await.unwrap());
        assert_eq!(calls, 1);
    }

    #[tokio::test]
    async fn idle_reports_nothing() {
        let path = temp_db("idle");
        let _pool = open_and_migrate(&path).await.unwrap();
        let mut watcher = DbWatcher::open(&path).await.unwrap();
        let mut calls = 0;
        for _ in 0..3 {
            assert!(!watcher.check(&mut || calls += 1).await.unwrap());
        }
        assert_eq!(calls, 0);
    }

    #[tokio::test]
    async fn own_commit_is_not_reported() {
        let path = temp_db("own");
        let _pool = open_and_migrate(&path).await.unwrap();
        let mut watcher = DbWatcher::open(&path).await.unwrap();
        let mut calls = 0;
        sqlx::query(WRITE).execute(&mut watcher.conn).await.unwrap();
        assert!(!watcher.check(&mut || calls += 1).await.unwrap());
        assert_eq!(calls, 0);
    }

    #[tokio::test]
    async fn watcher_does_not_block_writers_or_checkpoints() {
        let path = temp_db("busy");
        let pool = open_and_migrate(&path).await.unwrap();
        let mut watcher = DbWatcher::open(&path).await.unwrap();
        watcher.check(&mut || {}).await.unwrap();

        sqlx::query(WRITE).execute(&pool).await.unwrap();
        watcher.check(&mut || {}).await.unwrap();
        sqlx::query(WRITE).execute(&pool).await.unwrap();

        let (busy, _, _): (i64, i64, i64) = sqlx::query_as("PRAGMA wal_checkpoint(TRUNCATE)")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(busy, 0);
    }

    #[tokio::test]
    async fn missing_file_fails_and_is_not_created() {
        let path = temp_db("missing");
        assert!(DbWatcher::open(&path).await.is_err());
        assert!(!path.exists());
    }

    #[tokio::test]
    async fn connecting_changes_neither_journal_mode_nor_migrations() {
        let path = temp_db("untouched");
        let pool = open_and_migrate(&path).await.unwrap();
        let count = || async {
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM _sqlx_migrations")
                .fetch_one(&pool)
                .await
                .unwrap()
        };
        let before = count().await;

        let mut watcher = DbWatcher::open(&path).await.unwrap();
        watcher.check(&mut || {}).await.unwrap();

        let mode: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(mode, "wal");
        assert_eq!(count().await, before);
    }
}
