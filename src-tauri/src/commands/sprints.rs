use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

#[derive(Debug, FromRow, Serialize)]
pub struct Sprint {
    pub id: i64,
    pub project_id: i64,
    pub name: String,
    pub goal: String,
    pub start_date: String,
    pub end_date: String,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct SprintCreate {
    pub project_id: i64,
    pub name: String,
    pub goal: Option<String>,
    pub start_date: String,
    pub end_date: String,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SprintUpdate {
    pub name: Option<String>,
    pub goal: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub status: Option<String>,
}

#[tauri::command]
pub async fn create_sprint(
    pool: State<'_, SqlitePool>,
    payload: SprintCreate,
) -> Result<Sprint, String> {
    let id: i64 = sqlx::query_scalar(
        r#"INSERT INTO sprints (project_id, name, goal, start_date, end_date, status)
           VALUES (?, ?, ?, ?, ?, ?) RETURNING id"#,
    )
    .bind(payload.project_id)
    .bind(&payload.name)
    .bind(payload.goal.unwrap_or_default())
    .bind(&payload.start_date)
    .bind(&payload.end_date)
    .bind(payload.status.unwrap_or_else(|| "backlog".into()))
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    get_sprint(pool, id).await
}

#[tauri::command]
pub async fn list_sprints(
    pool: State<'_, SqlitePool>,
    project_id: Option<i64>,
) -> Result<Vec<Sprint>, String> {
    match project_id {
        Some(pid) => sqlx::query_as::<_, Sprint>(
            "SELECT * FROM sprints WHERE project_id = ? ORDER BY start_date DESC",
        )
        .bind(pid)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string()),
        None => sqlx::query_as::<_, Sprint>("SELECT * FROM sprints ORDER BY start_date DESC")
            .fetch_all(pool.inner())
            .await
            .map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub async fn get_sprint(pool: State<'_, SqlitePool>, id: i64) -> Result<Sprint, String> {
    sqlx::query_as::<_, Sprint>("SELECT * FROM sprints WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_sprint(
    pool: State<'_, SqlitePool>,
    id: i64,
    payload: SprintUpdate,
) -> Result<Sprint, String> {
    let current = get_sprint(pool.clone(), id).await?;
    sqlx::query(
        "UPDATE sprints SET name = ?, goal = ?, start_date = ?, end_date = ?, status = ? WHERE id = ?",
    )
    .bind(payload.name.unwrap_or(current.name))
    .bind(payload.goal.unwrap_or(current.goal))
    .bind(payload.start_date.unwrap_or(current.start_date))
    .bind(payload.end_date.unwrap_or(current.end_date))
    .bind(payload.status.unwrap_or(current.status))
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    get_sprint(pool, id).await
}

#[tauri::command]
pub async fn delete_sprint(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM sprints WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
