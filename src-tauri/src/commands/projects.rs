use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

#[derive(Debug, FromRow, Serialize)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub key: String,
    pub description: String,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct ProjectCreate {
    pub name: String,
    pub key: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ProjectUpdate {
    pub name: Option<String>,
    pub key: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[tauri::command]
pub async fn create_project(
    pool: State<'_, SqlitePool>,
    payload: ProjectCreate,
) -> Result<Project, String> {
    let id: i64 = sqlx::query_scalar(
        r#"INSERT INTO projects (name, key, description, color, created_at)
           VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           RETURNING id"#,
    )
    .bind(&payload.name)
    .bind(&payload.key)
    .bind(payload.description.unwrap_or_default())
    .bind(payload.color.unwrap_or_else(|| "#6366f1".into()))
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    get_project(pool, id).await
}

#[tauri::command]
pub async fn list_projects(pool: State<'_, SqlitePool>) -> Result<Vec<Project>, String> {
    sqlx::query_as::<_, Project>("SELECT * FROM projects ORDER BY created_at DESC")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_project(pool: State<'_, SqlitePool>, id: i64) -> Result<Project, String> {
    sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_project(
    pool: State<'_, SqlitePool>,
    id: i64,
    payload: ProjectUpdate,
) -> Result<Project, String> {
    let current = get_project(pool.clone(), id).await?;
    sqlx::query(
        "UPDATE projects SET name = ?, key = ?, description = ?, color = ? WHERE id = ?",
    )
    .bind(payload.name.unwrap_or(current.name))
    .bind(payload.key.unwrap_or(current.key))
    .bind(payload.description.unwrap_or(current.description))
    .bind(payload.color.unwrap_or(current.color))
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    get_project(pool, id).await
}

#[tauri::command]
pub async fn delete_project(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
