use super::deserialize_optional_field;
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
    /// Optional logo as a base64 data URL. NULL = use the colored square.
    pub logo_data: Option<String>,
    /// Manual sort order for the sidebar (ascending).
    pub position: i64,
}

#[derive(Debug, Deserialize)]
pub struct ProjectCreate {
    pub name: String,
    pub key: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub logo_data: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ProjectUpdate {
    pub name: Option<String>,
    pub key: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub logo_data: Option<Option<String>>,
}

#[tauri::command]
pub async fn create_project(
    pool: State<'_, SqlitePool>,
    payload: ProjectCreate,
) -> Result<Project, String> {
    let id: i64 = sqlx::query_scalar(
        r#"INSERT INTO projects (name, key, description, color, logo_data, created_at, position)
           VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                   (SELECT COALESCE(MAX(position), 0) + 1 FROM projects))
           RETURNING id"#,
    )
    .bind(&payload.name)
    .bind(&payload.key)
    .bind(payload.description.unwrap_or_default())
    .bind(payload.color.unwrap_or_else(|| "#6366f1".into()))
    .bind(payload.logo_data)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    get_project(pool, id).await
}

#[tauri::command]
pub async fn list_projects(pool: State<'_, SqlitePool>) -> Result<Vec<Project>, String> {
    sqlx::query_as::<_, Project>("SELECT * FROM projects ORDER BY position ASC, created_at DESC")
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
        "UPDATE projects SET name = ?, key = ?, description = ?, color = ?, logo_data = ? WHERE id = ?",
    )
    .bind(payload.name.unwrap_or(current.name))
    .bind(payload.key.unwrap_or(current.key))
    .bind(payload.description.unwrap_or(current.description))
    .bind(payload.color.unwrap_or(current.color))
    .bind(payload.logo_data.unwrap_or(current.logo_data))
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

/// Persist a new sidebar ordering: each project's `position` is set to its
/// index in `ordered_ids`. Applied in a single transaction.
#[tauri::command]
pub async fn reorder_projects(
    pool: State<'_, SqlitePool>,
    ordered_ids: Vec<i64>,
) -> Result<(), String> {
    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
    for (position, id) in ordered_ids.iter().enumerate() {
        sqlx::query("UPDATE projects SET position = ? WHERE id = ?")
            .bind(position as i64)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::ProjectUpdate;

    #[test]
    fn absent_logo_data_keeps_current() {
        let u: ProjectUpdate = serde_json::from_str(r#"{}"#).unwrap();
        assert!(u.logo_data.is_none(), "absent field must be outer None (keep current)");
    }

    #[test]
    fn null_logo_data_clears_logo() {
        let u: ProjectUpdate = serde_json::from_str(r#"{"logo_data": null}"#).unwrap();
        assert_eq!(u.logo_data, Some(None), "null must be Some(None) to clear the logo");
    }

    #[test]
    fn value_logo_data_sets_logo() {
        let u: ProjectUpdate =
            serde_json::from_str(r#"{"logo_data": "data:image/jpeg;base64,AAAA"}"#).unwrap();
        assert_eq!(u.logo_data, Some(Some("data:image/jpeg;base64,AAAA".to_string())));
    }
}
