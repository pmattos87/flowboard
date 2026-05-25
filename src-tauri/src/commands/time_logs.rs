use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

#[derive(Debug, FromRow, Serialize)]
pub struct TimeLog {
    pub id: i64,
    pub task_id: i64,
    pub person_id: i64,
    pub minutes: i64,
    pub logged_at: String,
    pub note: String,
}

#[derive(Debug, Deserialize)]
pub struct TimeLogCreate {
    pub task_id: i64,
    pub person_id: i64,
    pub minutes: i64,
    pub logged_at: Option<String>,
    pub note: Option<String>,
}

#[tauri::command]
pub async fn create_time_log(
    pool: State<'_, SqlitePool>,
    payload: TimeLogCreate,
) -> Result<TimeLog, String> {
    let id: i64 = sqlx::query_scalar(
        r#"INSERT INTO time_logs (task_id, person_id, minutes, logged_at, note)
           VALUES (?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ','now')), ?)
           RETURNING id"#,
    )
    .bind(payload.task_id)
    .bind(payload.person_id)
    .bind(payload.minutes)
    .bind(payload.logged_at)
    .bind(payload.note.unwrap_or_default())
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, TimeLog>("SELECT * FROM time_logs WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_time_logs(
    pool: State<'_, SqlitePool>,
    task_id: i64,
) -> Result<Vec<TimeLog>, String> {
    sqlx::query_as::<_, TimeLog>(
        "SELECT * FROM time_logs WHERE task_id = ? ORDER BY logged_at DESC",
    )
    .bind(task_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_time_log(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM time_logs WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
