use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

/// Open (and create on first run) the SQLite pool at `<appDataDir>/flowboard.db`.
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

    SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .map_err(|e| format!("failed to open sqlite pool: {e}"))
}
