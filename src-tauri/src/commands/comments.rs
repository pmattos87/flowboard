use serde::{Deserialize, Serialize};
use crate::factory;
use sqlx::{FromRow, Sqlite, SqlitePool, Transaction};
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

const TASK_PROJECT: &str = "SELECT project_id FROM tasks WHERE id = ?";
const COMMENT_PROJECT: &str =
    "SELECT t.project_id FROM comments c JOIN tasks t ON t.id = c.task_id WHERE c.id = ?";

/// FB-14: refuse a comment write on an archived project. `project_sql` finds
/// the project from `id` ([`TASK_PROJECT`] or [`COMMENT_PROJECT`]); `false`
/// when there is no such row. Called inside the write's own `BEGIN IMMEDIATE`
/// transaction, so the write lock is held from the check to the commit and an
/// archive can't commit in between.
async fn require_writable_in(
    tx: &mut Transaction<'_, Sqlite>,
    project_sql: &str,
    id: i64,
) -> Result<bool, String> {
    let project_id: Option<i64> = sqlx::query_scalar(project_sql)
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    match project_id {
        Some(pid) => factory::ops::require_writable(&mut **tx, pid).await.map(|()| true),
        None => Ok(false),
    }
}

pub async fn create_comment_inner(pool: &SqlitePool, payload: CommentCreate) -> Result<Comment, String> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await.map_err(|e| e.to_string())?;
    if !require_writable_in(&mut tx, TASK_PROJECT, payload.task_id).await? {
        return Err(format!("task {} not found", payload.task_id));
    }
    let id: i64 = sqlx::query_scalar(
        r#"INSERT INTO comments (task_id, author_id, body, created_at)
           VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           RETURNING id"#,
    )
    .bind(payload.task_id)
    .bind(payload.author_id)
    .bind(&payload.body)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Comment>("SELECT * FROM comments WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_comment(
    pool: State<'_, SqlitePool>,
    payload: CommentCreate,
) -> Result<Comment, String> {
    create_comment_inner(pool.inner(), payload).await
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
pub async fn update_comment_inner(pool: &SqlitePool, id: i64, body: &str) -> Result<Comment, String> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await.map_err(|e| e.to_string())?;
    if !require_writable_in(&mut tx, COMMENT_PROJECT, id).await? {
        return Err(format!("comment {id} not found"));
    }
    sqlx::query(
        r#"UPDATE comments
           SET body = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE id = ?"#,
    )
    .bind(body)
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Comment>("SELECT * FROM comments WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_comment(
    pool: State<'_, SqlitePool>,
    id: i64,
    body: String,
) -> Result<Comment, String> {
    update_comment_inner(pool.inner(), id, &body).await
}

/// Deleting a comment that does not exist is a no-op, as before FB-14.
pub async fn delete_comment_inner(pool: &SqlitePool, id: i64) -> Result<(), String> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await.map_err(|e| e.to_string())?;
    if !require_writable_in(&mut tx, COMMENT_PROJECT, id).await? {
        return Ok(());
    }
    sqlx::query("DELETE FROM comments WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_comment(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    delete_comment_inner(pool.inner(), id).await
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

    /// FB-14: on an archived project the app's create, edit and delete of a
    /// comment are refused and change no row; after unarchive all three work.
    #[tokio::test]
    async fn comment_writes_are_refused_on_an_archived_project_and_work_after_unarchive() {
        use crate::commands::projects::set_project_state_inner;
        use crate::test_support::{self as ts, TaskStatus, TaskType};
        let pool = ts::pool().await;
        let p = ts::factory_project(&pool, "SF").await;
        let story = ts::task(&pool, p, None, None, TaskType::Story, TaskStatus::Backlog).await;
        let new = |body: &str| CommentCreate { task_id: story, author_id: ts::OWNER, body: body.into() };
        let existing = create_comment_inner(&pool, new("original")).await.unwrap();

        set_project_state_inner(&pool, p, "archived").await.unwrap();
        let refused = "SF is archived; unarchive it first";
        assert_eq!(create_comment_inner(&pool, new("added")).await.unwrap_err(), refused);
        assert_eq!(update_comment_inner(&pool, existing.id, "edited").await.unwrap_err(), refused);
        assert_eq!(delete_comment_inner(&pool, existing.id).await.unwrap_err(), refused);
        let rows: Vec<(i64, String, Option<String>)> =
            sqlx::query_as("SELECT id, body, updated_at FROM comments WHERE task_id = ?")
                .bind(story)
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(rows, vec![(existing.id, "original".to_string(), None)], "no row changed");

        set_project_state_inner(&pool, p, "active").await.unwrap();
        let added = create_comment_inner(&pool, new("added")).await.unwrap();
        assert_eq!(added.body, "added");
        assert_eq!(update_comment_inner(&pool, existing.id, "edited").await.unwrap().body, "edited");
        delete_comment_inner(&pool, existing.id).await.unwrap();
        let ids: Vec<i64> = sqlx::query_scalar("SELECT id FROM comments WHERE task_id = ?")
            .bind(story)
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(ids, vec![added.id]);
    }
}
