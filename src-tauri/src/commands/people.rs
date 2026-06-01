use super::deserialize_optional_field;
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
    /// Optional profile photo as a base64 data URL. NULL = use colored initials.
    pub avatar_data: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PersonCreate {
    pub name: String,
    pub email: String,
    pub avatar_color: Option<String>,
    pub role: Option<String>,
    pub avatar_data: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PersonUpdate {
    pub name: Option<String>,
    pub email: Option<String>,
    pub avatar_color: Option<String>,
    pub role: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub avatar_data: Option<Option<String>>,
}

#[tauri::command]
pub async fn create_person(
    pool: State<'_, SqlitePool>,
    payload: PersonCreate,
) -> Result<Person, String> {
    let id: i64 = sqlx::query_scalar(
        r#"INSERT INTO people (name, email, avatar_color, role, avatar_data)
           VALUES (?, ?, ?, ?, ?) RETURNING id"#,
    )
    .bind(&payload.name)
    .bind(&payload.email)
    .bind(payload.avatar_color.unwrap_or_else(|| "#6366f1".into()))
    .bind(payload.role.unwrap_or_default())
    .bind(payload.avatar_data)
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
    sqlx::query(
        "UPDATE people SET name = ?, email = ?, avatar_color = ?, role = ?, avatar_data = ? WHERE id = ?",
    )
        .bind(payload.name.unwrap_or(current.name))
        .bind(payload.email.unwrap_or(current.email))
        .bind(payload.avatar_color.unwrap_or(current.avatar_color))
        .bind(payload.role.unwrap_or(current.role))
        .bind(payload.avatar_data.unwrap_or(current.avatar_data))
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

#[cfg(test)]
mod tests {
    use super::PersonUpdate;

    #[test]
    fn absent_avatar_data_keeps_current() {
        let u: PersonUpdate = serde_json::from_str(r#"{}"#).unwrap();
        assert!(u.avatar_data.is_none(), "absent field must be outer None (keep current)");
    }

    #[test]
    fn null_avatar_data_clears_photo() {
        let u: PersonUpdate = serde_json::from_str(r#"{"avatar_data": null}"#).unwrap();
        assert_eq!(u.avatar_data, Some(None), "null must be Some(None) to clear the photo");
    }

    #[test]
    fn value_avatar_data_sets_photo() {
        let u: PersonUpdate =
            serde_json::from_str(r#"{"avatar_data": "data:image/jpeg;base64,AAAA"}"#).unwrap();
        assert_eq!(u.avatar_data, Some(Some("data:image/jpeg;base64,AAAA".to_string())));
    }
}
