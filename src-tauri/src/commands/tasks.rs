use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

#[derive(Debug, FromRow, Serialize)]
pub struct Task {
    pub id: i64,
    pub project_id: i64,
    pub sprint_id: Option<i64>,
    pub parent_id: Option<i64>,
    pub title: String,
    pub description: String,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub r#type: String,
    pub status: String,
    pub priority: String,
    pub assignee_id: Option<i64>,
    pub story_points: i64,
    pub due_date: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub labels: String,
}

#[derive(Debug, Deserialize)]
pub struct TaskCreate {
    pub project_id: i64,
    pub sprint_id: Option<i64>,
    pub parent_id: Option<i64>,
    pub title: String,
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub r#type: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub assignee_id: Option<i64>,
    pub story_points: Option<i64>,
    pub due_date: Option<String>,
    pub labels: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TaskUpdate {
    pub sprint_id: Option<Option<i64>>,
    pub parent_id: Option<Option<i64>>,
    pub title: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub r#type: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub assignee_id: Option<Option<i64>>,
    pub story_points: Option<i64>,
    pub due_date: Option<Option<String>>,
    pub labels: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct TaskListFilters {
    pub project_id: Option<i64>,
    pub sprint_id: Option<i64>,
    pub status: Option<String>,
    pub assignee_id: Option<i64>,
    pub parent_id: Option<i64>,
}

#[tauri::command]
pub async fn create_task(
    pool: State<'_, SqlitePool>,
    payload: TaskCreate,
) -> Result<Task, String> {
    let id: i64 = sqlx::query_scalar(
        r#"INSERT INTO tasks (
            project_id, sprint_id, parent_id, title, description,
            type, status, priority, assignee_id, story_points,
            due_date, created_at, updated_at, labels
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            ?)
        RETURNING id"#,
    )
    .bind(payload.project_id)
    .bind(payload.sprint_id)
    .bind(payload.parent_id)
    .bind(&payload.title)
    .bind(payload.description.unwrap_or_default())
    .bind(payload.r#type.unwrap_or_else(|| "task".into()))
    .bind(payload.status.unwrap_or_else(|| "todo".into()))
    .bind(payload.priority.unwrap_or_else(|| "medium".into()))
    .bind(payload.assignee_id)
    .bind(payload.story_points.unwrap_or(0))
    .bind(payload.due_date)
    .bind(payload.labels.unwrap_or_default())
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    get_task(pool, id).await
}

#[tauri::command]
pub async fn list_tasks(
    pool: State<'_, SqlitePool>,
    filters: Option<TaskListFilters>,
) -> Result<Vec<Task>, String> {
    let f = filters.unwrap_or_default();
    let mut sql = String::from("SELECT * FROM tasks WHERE 1=1");
    if f.project_id.is_some() {
        sql.push_str(" AND project_id = ?");
    }
    if f.sprint_id.is_some() {
        sql.push_str(" AND sprint_id = ?");
    }
    if f.status.is_some() {
        sql.push_str(" AND status = ?");
    }
    if f.assignee_id.is_some() {
        sql.push_str(" AND assignee_id = ?");
    }
    if f.parent_id.is_some() {
        sql.push_str(" AND parent_id = ?");
    }
    sql.push_str(" ORDER BY created_at DESC");

    let mut q = sqlx::query_as::<_, Task>(&sql);
    if let Some(v) = f.project_id {
        q = q.bind(v);
    }
    if let Some(v) = f.sprint_id {
        q = q.bind(v);
    }
    if let Some(v) = f.status {
        q = q.bind(v);
    }
    if let Some(v) = f.assignee_id {
        q = q.bind(v);
    }
    if let Some(v) = f.parent_id {
        q = q.bind(v);
    }

    q.fetch_all(pool.inner()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_task(pool: State<'_, SqlitePool>, id: i64) -> Result<Task, String> {
    sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_task(
    pool: State<'_, SqlitePool>,
    id: i64,
    payload: TaskUpdate,
) -> Result<Task, String> {
    let current = get_task(pool.clone(), id).await?;

    sqlx::query(
        r#"UPDATE tasks SET
            sprint_id    = ?,
            parent_id    = ?,
            title        = ?,
            description  = ?,
            type         = ?,
            status       = ?,
            priority     = ?,
            assignee_id  = ?,
            story_points = ?,
            due_date     = ?,
            labels       = ?,
            updated_at   = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE id = ?"#,
    )
    .bind(payload.sprint_id.unwrap_or(current.sprint_id))
    .bind(payload.parent_id.unwrap_or(current.parent_id))
    .bind(payload.title.unwrap_or(current.title))
    .bind(payload.description.unwrap_or(current.description))
    .bind(payload.r#type.unwrap_or(current.r#type))
    .bind(payload.status.unwrap_or(current.status))
    .bind(payload.priority.unwrap_or(current.priority))
    .bind(payload.assignee_id.unwrap_or(current.assignee_id))
    .bind(payload.story_points.unwrap_or(current.story_points))
    .bind(payload.due_date.unwrap_or(current.due_date))
    .bind(payload.labels.unwrap_or(current.labels))
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    get_task(pool, id).await
}

#[tauri::command]
pub async fn delete_task(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM tasks WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
