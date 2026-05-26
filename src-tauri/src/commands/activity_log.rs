use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

#[derive(Debug, FromRow, Serialize)]
pub struct ActivityLog {
    pub id: i64,
    pub task_id: i64,
    pub person_id: i64,
    pub action: String,
    pub old_value: String,
    pub new_value: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct ActivityLogCreate {
    pub task_id: i64,
    pub person_id: i64,
    pub action: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
}

#[tauri::command]
pub async fn create_activity_log(
    pool: State<'_, SqlitePool>,
    payload: ActivityLogCreate,
) -> Result<ActivityLog, String> {
    let id: i64 = sqlx::query_scalar(
        r#"INSERT INTO activity_log (task_id, person_id, action, old_value, new_value, created_at)
           VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           RETURNING id"#,
    )
    .bind(payload.task_id)
    .bind(payload.person_id)
    .bind(&payload.action)
    .bind(payload.old_value.unwrap_or_default())
    .bind(payload.new_value.unwrap_or_default())
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, ActivityLog>("SELECT * FROM activity_log WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_activity_log(
    pool: State<'_, SqlitePool>,
    task_id: i64,
) -> Result<Vec<ActivityLog>, String> {
    sqlx::query_as::<_, ActivityLog>(
        "SELECT * FROM activity_log WHERE task_id = ? ORDER BY created_at DESC",
    )
    .bind(task_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_activity_log_by_sprint(
    pool: State<'_, SqlitePool>,
    sprint_id: i64,
) -> Result<Vec<ActivityLog>, String> {
    sqlx::query_as::<_, ActivityLog>(
        r#"SELECT a.* FROM activity_log a
           JOIN tasks t ON t.id = a.task_id
           WHERE t.sprint_id = ?
           ORDER BY a.created_at ASC"#,
    )
    .bind(sprint_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}
