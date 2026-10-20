use sqlx::migrate::Migrator;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::{ConnectOptions, Connection, SqliteConnection, SqlitePool};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

/// Open (and create on first run) the SQLite pool at `<appDataDir>/flowboard.db`,
/// applying all pending migrations first.
pub async fn init_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("failed to create app data dir: {e}"))?;

    open_and_migrate(&app_data_dir.join("flowboard.db")).await
}

fn sqlite_url(path: &Path, mode: &str) -> String {
    format!(
        "sqlite://{}?mode={mode}",
        path.to_string_lossy().replace('\\', "/")
    )
}

/// Back up, migrate, then open the runtime pool for the database at `path`.
///
/// `PRAGMA foreign_keys = ON` is set on every runtime connection so CASCADE
/// DELETE works. Migrations, however, run on a dedicated connection with foreign
/// keys OFF: sqlx-sqlite always wraps a migration in a transaction, and
/// `PRAGMA foreign_keys` is a no-op inside a transaction. A migration that
/// rebuilds a table (e.g. to change a CHECK constraint) drops the old table,
/// which — with FK enforcement on — fires the ON DELETE actions of every child
/// reference (orphaning `parent_id` and cascade-deleting comments, time logs,
/// etc.). FK enforcement must be disabled at connect time, before the migration
/// transaction begins; the in-SQL `PRAGMA foreign_keys = OFF` cannot do this.
///
/// Runtime connections use WAL so the Flowboard CLI can write while the app is
/// open; sqlx's default 5s busy timeout covers the brief write locks.
pub async fn open_and_migrate(path: &Path) -> Result<SqlitePool, String> {
    let url = sqlite_url(path, "rwc");

    let mut migrate_conn = SqliteConnectOptions::from_str(&url)
        .map_err(|e| e.to_string())?
        .foreign_keys(false)
        .connect()
        .await
        .map_err(|e| format!("failed to open migration connection: {e}"))?;
    backup_before_migrations(&mut migrate_conn, path).await?;
    MIGRATOR
        .run(&mut migrate_conn)
        .await
        .map_err(|e| format!("failed to apply sqlx migrations: {e}"))?;
    migrate_conn
        .close()
        .await
        .map_err(|e| format!("failed to close migration connection: {e}"))?;

    let options = SqliteConnectOptions::from_str(&url)
        .map_err(|e| e.to_string())?
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal);

    SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|e| format!("failed to open sqlite pool: {e}"))
}

/// Versions of the migrations successfully applied to this database. Empty for
/// a brand-new database.
async fn applied_versions(conn: &mut SqliteConnection) -> Result<Vec<i64>, String> {
    let has_table: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
    )
    .fetch_one(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;
    if has_table == 0 {
        return Ok(vec![]);
    }
    sqlx::query_scalar("SELECT version FROM _sqlx_migrations WHERE success = 1 ORDER BY version")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())
}

/// When an existing database has pending migrations, write a consistent copy
/// next to it (`flowboard.db.pre-migration-<unix secs>.bak`) before touching it.
/// `VACUUM INTO` includes anything still in the WAL, unlike a plain file copy.
async fn backup_before_migrations(
    conn: &mut SqliteConnection,
    path: &Path,
) -> Result<Option<PathBuf>, String> {
    let applied = applied_versions(conn).await?;
    if applied.is_empty() {
        return Ok(None);
    }
    let pending = MIGRATOR.iter().any(|m| !applied.contains(&m.version));
    if !pending {
        return Ok(None);
    }
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".pre-migration-{secs}.bak"));
    let backup = path.with_file_name(name);
    sqlx::query("VACUUM INTO ?")
        .bind(backup.to_string_lossy().to_string())
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("failed to back up database before migrating: {e}"))?;
    Ok(Some(backup))
}

/// Open an existing database for the Flowboard CLI without migrating it.
///
/// The CLI and the app ship the same migration set. If they differ, sqlx in the
/// older of the two would refuse the database, so the CLI refuses first and says
/// which side to update.
pub async fn open_existing(path: &Path) -> Result<SqlitePool, String> {
    if !path.exists() {
        return Err(format!(
            "no Flowboard database at {} (open the app once to create it)",
            path.display()
        ));
    }
    let url = sqlite_url(path, "rw");
    // Check versions on a plain connection first: a refused database must be
    // left exactly as it was, journal mode included.
    let mut probe = SqliteConnectOptions::from_str(&url)
        .map_err(|e| e.to_string())?
        .connect()
        .await
        .map_err(|e| format!("failed to open {}: {e}", path.display()))?;
    let applied = applied_versions(&mut probe).await?;
    probe.close().await.map_err(|e| e.to_string())?;
    let known: Vec<i64> = MIGRATOR.iter().map(|m| m.version).collect();
    if applied.iter().any(|v| !known.contains(v)) {
        return Err(
            "the database was migrated by a newer Flowboard app; rebuild flowboard-cli from the same version"
                .into(),
        );
    }
    if known.iter().any(|v| !applied.contains(v)) {
        return Err(
            "the database is behind this flowboard-cli; open the updated Flowboard app once to migrate it"
                .into(),
        );
    }
    let options = SqliteConnectOptions::from_str(&url)
        .map_err(|e| e.to_string())?
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5));
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|e| format!("failed to open {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "flowboard-db-test-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("flowboard.db")
    }

    /// Apply only the migrations below `version` to a fresh file, as an older
    /// app would have.
    async fn migrate_up_to(path: &Path, version: i64) {
        let mut conn = SqliteConnectOptions::from_str(&sqlite_url(path, "rwc"))
            .unwrap()
            .foreign_keys(false)
            .connect()
            .await
            .unwrap();
        let older = Migrator {
            migrations: MIGRATOR
                .iter()
                .filter(|m| m.version < version)
                .cloned()
                .collect::<Vec<_>>()
                .into(),
            ..Migrator::DEFAULT
        };
        older.run(&mut conn).await.unwrap();
        conn.close().await.unwrap();
    }

    fn backups_in(path: &Path) -> usize {
        std::fs::read_dir(path.parent().unwrap())
            .unwrap()
            .filter(|e| {
                e.as_ref()
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .contains(".pre-migration-")
            })
            .count()
    }

    #[tokio::test]
    async fn backs_up_only_when_an_existing_db_has_pending_migrations() {
        let path = temp_db("backup");
        migrate_up_to(&path, 10).await;

        open_and_migrate(&path).await.unwrap().close().await;
        assert_eq!(backups_in(&path), 1, "pending migration 010 must trigger a backup");

        open_and_migrate(&path).await.unwrap().close().await;
        assert_eq!(backups_in(&path), 1, "an up-to-date database must not be backed up again");
    }

    #[tokio::test]
    async fn fresh_database_is_not_backed_up() {
        let path = temp_db("fresh");
        open_and_migrate(&path).await.unwrap().close().await;
        assert_eq!(backups_in(&path), 0);
    }

    #[tokio::test]
    async fn open_existing_refuses_a_database_behind_the_cli() {
        let path = temp_db("behind");
        migrate_up_to(&path, 10).await;
        let err = open_existing(&path).await.unwrap_err();
        assert!(err.contains("open the updated Flowboard app"), "{err}");

        let mut conn = SqliteConnectOptions::from_str(&sqlite_url(&path, "ro"))
            .unwrap()
            .connect()
            .await
            .unwrap();
        let mode: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(&mut conn)
            .await
            .unwrap();
        assert_eq!(mode, "delete", "a refused database must not be switched to WAL");
    }

    /// Every row of every pre-existing table, original columns only, as SQL
    /// literals (`quote()` keeps BLOBs as hex) ordered by rowid.
    async fn snapshot(
        conn: &mut SqliteConnection,
        columns: &[(String, Vec<String>)],
    ) -> Vec<(String, Vec<String>)> {
        let mut out = vec![];
        for (table, cols) in columns {
            let list = cols
                .iter()
                .map(|c| format!("quote(\"{c}\")"))
                .collect::<Vec<_>>()
                .join(" || '|' || ");
            let rows: Vec<String> = sqlx::query_scalar(&format!(
                "SELECT {list} FROM \"{table}\" ORDER BY rowid"
            ))
            .fetch_all(&mut *conn)
            .await
            .unwrap();
            out.push((table.clone(), rows));
        }
        out
    }

    /// Run with `FLOWBOARD_MIGRATION_SOURCE=<path to a real flowboard.db>
    /// cargo test --lib real_database_survives_migration -- --ignored`.
    /// The source is only read (copied with VACUUM INTO); the copy is migrated.
    #[tokio::test]
    #[ignore]
    async fn real_database_survives_migration() {
        let source = PathBuf::from(
            std::env::var("FLOWBOARD_MIGRATION_SOURCE").expect("set FLOWBOARD_MIGRATION_SOURCE"),
        );
        let path = temp_db("real");
        let mut src = SqliteConnectOptions::from_str(&sqlite_url(&source, "ro"))
            .unwrap()
            .connect()
            .await
            .unwrap();
        sqlx::query("VACUUM INTO ?")
            .bind(path.to_string_lossy().to_string())
            .execute(&mut src)
            .await
            .unwrap();
        src.close().await.unwrap();

        let mut conn = SqliteConnectOptions::from_str(&sqlite_url(&path, "rw"))
            .unwrap()
            .connect()
            .await
            .unwrap();
        let tables: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_sqlx_migrations' ORDER BY name",
        )
        .fetch_all(&mut conn)
        .await
        .unwrap();
        let mut columns = vec![];
        for t in tables {
            let cols: Vec<String> =
                sqlx::query_scalar(&format!("SELECT name FROM pragma_table_info('{t}')"))
                    .fetch_all(&mut conn)
                    .await
                    .unwrap();
            columns.push((t, cols));
        }
        let before = snapshot(&mut conn, &columns).await;
        conn.close().await.unwrap();

        let pool = open_and_migrate(&path).await.unwrap();
        let mut conn = pool.acquire().await.unwrap();
        let after = snapshot(&mut conn, &columns).await;
        let fk_violations: Vec<(String,)> = sqlx::query_as("SELECT \"table\" FROM pragma_foreign_key_check")
            .fetch_all(&mut *conn)
            .await
            .unwrap();
        drop(conn);
        pool.close().await;

        for ((table, rows_before), (_, rows_after)) in before.iter().zip(after.iter()) {
            println!("{table}: {} rows before, {} after", rows_before.len(), rows_after.len());
            assert_eq!(rows_before, rows_after, "table {table} changed during migration");
        }
        assert!(fk_violations.is_empty(), "foreign key violations: {fk_violations:?}");
        assert_eq!(backups_in(&path), 1, "the migration must have written a backup");
    }

    #[tokio::test]
    async fn open_existing_accepts_a_current_database() {
        let path = temp_db("current");
        open_and_migrate(&path).await.unwrap().close().await;
        open_existing(&path).await.unwrap().close().await;
    }
}
