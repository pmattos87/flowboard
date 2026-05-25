use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

#[derive(Debug, FromRow, Serialize)]
pub struct Person {
    pub id: i64,
    pub name: String,
    pub email: String,
    pub avatar_color: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct PersonCreate {
    pub name: String,
    pub email: String,
    pub avatar_color: Option<String>,
    pub role: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PersonUpdate {
    pub name: Option<String>,
    pub email: Option<String>,
    pub avatar_color: Option<String>,
    pub role: Option<String>,
}

#[tauri::command]
pub async fn create_person(
    pool: State<'_, SqlitePool>,
    payload: PersonCreate,
) -> Result<Person, String> {
    let id: i64 = sqlx::query_scalar(
        r#"INSERT INTO people (name, email, avatar_color, role)
           VALUES (?, ?, ?, ?) RETURNING id"#,
    )
    .bind(&payload.name)
    .bind(&payload.email)
    .bind(payload.avatar_color.unwrap_or_else(|| "#6366f1".into()))
    .bind(payload.role.unwrap_or_default())
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    get_person(pool, id).await
}

#[tauri::command]
pub async fn list_people(pool: State<'_, SqlitePool>) -> Result<Vec<Person>, String> {
    sqlx::query_as::<_, Person>("SELECT * FROM people ORDER BY name ASC")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_person(pool: State<'_, SqlitePool>, id: i64) -> Result<Person, String> {
    sqlx::query_as::<_, Person>("SELECT * FROM people WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_person(
    pool: State<'_, SqlitePool>,
    id: i64,
    payload: PersonUpdate,
) -> Result<Person, String> {
    let current = get_person(pool.clone(), id).await?;
    sqlx::query("UPDATE people SET name = ?, email = ?, avatar_color = ?, role = ? WHERE id = ?")
        .bind(payload.name.unwrap_or(current.name))
        .bind(payload.email.unwrap_or(current.email))
        .bind(payload.avatar_color.unwrap_or(current.avatar_color))
        .bind(payload.role.unwrap_or(current.role))
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    get_person(pool, id).await
}

#[tauri::command]
pub async fn delete_person(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM people WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
