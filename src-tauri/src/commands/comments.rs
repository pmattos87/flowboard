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
    /// FB-46: NULL until the comment is first edited.
    pub updated_at: Option<String>,
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

/// FB-46: edits the body only. The author is fixed at creation time.
#[tauri::command]
pub async fn update_comment(
    pool: State<'_, SqlitePool>,
    id: i64,
    body: String,
) -> Result<Comment, String> {
    sqlx::query(
        r#"UPDATE comments
           SET body = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE id = ?"#,
    )
    .bind(&body)
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Comment>("SELECT * FROM comments WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
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

#[cfg(test)]
mod tests {
    use super::*;

    async fn new_test_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    async fn seed_comment(pool: &SqlitePool) -> i64 {
        let project_id = sqlx::query_scalar::<_, i64>(
            r#"INSERT INTO projects (name, key, created_at)
               VALUES ('P', 'P', '2026-01-01T00:00:00.000Z') RETURNING id"#,
        )
        .fetch_one(pool)
        .await
        .unwrap();
        let person_id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO people (name, email) VALUES ('Alice', 'a@test') RETURNING id",
        )
        .fetch_one(pool)
        .await
        .unwrap();
        let task_id = sqlx::query_scalar::<_, i64>(
            r#"INSERT INTO tasks (project_id, title, created_at, updated_at)
               VALUES (?, 'T', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
               RETURNING id"#,
        )
        .bind(project_id)
        .fetch_one(pool)
        .await
        .unwrap();
        sqlx::query_scalar::<_, i64>(
            r#"INSERT INTO comments (task_id, author_id, body, created_at)
               VALUES (?, ?, 'original', '2026-01-01T00:00:00.000Z') RETURNING id"#,
        )
        .bind(task_id)
        .bind(person_id)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    /// FB-46: a fresh comment reads back with `updated_at` NULL — that is what
    /// the UI keys the "(edited)" marker off.
    #[tokio::test]
    async fn new_comment_has_null_updated_at() {
        let pool = new_test_pool().await;
        let id = seed_comment(&pool).await;

        let c = sqlx::query_as::<_, Comment>("SELECT * FROM comments WHERE id = ?")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(c.body, "original");
        assert!(c.updated_at.is_none());
    }

    /// FB-46: editing replaces the body and stamps `updated_at`, leaving
    /// `created_at` and `author_id` alone.
    #[tokio::test]
    async fn editing_sets_body_and_updated_at() {
        let pool = new_test_pool().await;
        let id = seed_comment(&pool).await;
        let before = sqlx::query_as::<_, Comment>("SELECT * FROM comments WHERE id = ?")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();

        sqlx::query(
            r#"UPDATE comments
               SET body = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
               WHERE id = ?"#,
        )
        .bind("edited")
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();

        let after = sqlx::query_as::<_, Comment>("SELECT * FROM comments WHERE id = ?")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(after.body, "edited");
        assert!(after.updated_at.is_some());
        assert_eq!(after.created_at, before.created_at);
        assert_eq!(after.author_id, before.author_id);
    }
}
