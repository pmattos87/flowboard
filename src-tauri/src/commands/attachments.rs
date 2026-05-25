use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

#[derive(Debug, FromRow, Serialize)]
pub struct Attachment {
    pub id: i64,
    pub task_id: i64,
    pub filename: String,
    pub filepath: String,
    pub size: i64,
    pub uploaded_at: String,
}

#[derive(Debug, Deserialize)]
pub struct AttachmentCreate {
    pub task_id: i64,
    pub filename: String,
    pub filepath: String,
    pub size: i64,
}

#[tauri::command]
pub async fn create_attachment(
    pool: State<'_, SqlitePool>,
    payload: AttachmentCreate,
) -> Result<Attachment, String> {
    let id: i64 = sqlx::query_scalar(
        r#"INSERT INTO attachments (task_id, filename, filepath, size, uploaded_at)
           VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           RETURNING id"#,
    )
    .bind(payload.task_id)
    .bind(&payload.filename)
    .bind(&payload.filepath)
    .bind(payload.size)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Attachment>("SELECT * FROM attachments WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_attachments(
    pool: State<'_, SqlitePool>,
    task_id: i64,
) -> Result<Vec<Attachment>, String> {
    sqlx::query_as::<_, Attachment>(
        "SELECT * FROM attachments WHERE task_id = ? ORDER BY uploaded_at DESC",
    )
    .bind(task_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_attachment(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM attachments WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
