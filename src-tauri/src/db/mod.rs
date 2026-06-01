use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{ConnectOptions, Connection, SqlitePool};
use std::str::FromStr;
use tauri::{AppHandle, Manager};

/// Open (and create on first run) the SQLite pool at `<appDataDir>/flowboard.db`,
/// applying all pending migrations first.
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
pub async fn init_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("failed to create app data dir: {e}"))?;

    let full_path = app_data_dir.join("flowboard.db");
    let url = format!(
        "sqlite://{}?mode=rwc",
        full_path.to_string_lossy().replace('\\', "/")
    );

    let mut migrate_conn = SqliteConnectOptions::from_str(&url)
        .map_err(|e| e.to_string())?
        .foreign_keys(false)
        .connect()
        .await
        .map_err(|e| format!("failed to open migration connection: {e}"))?;
    sqlx::migrate!("./migrations")
        .run(&mut migrate_conn)
        .await
        .map_err(|e| format!("failed to apply sqlx migrations: {e}"))?;
    migrate_conn
        .close()
        .await
        .map_err(|e| format!("failed to close migration connection: {e}"))?;

    let options = SqliteConnectOptions::from_str(&url)
        .map_err(|e| e.to_string())?
        .foreign_keys(true);

    SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|e| format!("failed to open sqlite pool: {e}"))
}
