use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

#[derive(Debug, FromRow, Serialize)]
pub struct Comment {
    pub id: i64,
    pub task_id: i64,
    pub author_id: i64,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CommentCreate {
    pub task_id: i64,
    pub author_id: i64,
    pub body: String,
}

#[tauri::command]
pub async fn create_comment(
    pool: State<'_, SqlitePool>,
    payload: CommentCreate,
) -> Result<Comment, String> {
    let id: i64 = sqlx::query_scalar(
        r#"INSERT INTO comments (task_id, author_id, body, created_at)
           VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           RETURNING id"#,
    )
    .bind(payload.task_id)
    .bind(payload.author_id)
    .bind(&payload.body)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Comment>("SELECT * FROM comments WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_comments(
    pool: State<'_, SqlitePool>,
    task_id: i64,
) -> Result<Vec<Comment>, String> {
    sqlx::query_as::<_, Comment>(
        "SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC",
    )
    .bind(task_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_comment(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM comments WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
