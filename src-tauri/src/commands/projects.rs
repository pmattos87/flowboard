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
    /// Software Factory: 'legacy' | 'factory' status ladder.
    pub ladder: String,
    /// The project's client (FB-202); NULL means internal.
    pub client_id: Option<i64>,
    /// Software Factory: 'internal' | 'client'. Not stored: derived from
    /// `client_id` by [`PROJECT_SQL`].
    pub kind: String,
}

/// Every project column plus the derived `kind` (client iff `client_id` is set).
const PROJECT_SQL: &str =
    "SELECT *, CASE WHEN client_id IS NULL THEN 'internal' ELSE 'client' END AS kind FROM projects";

/// Set project `?2`'s client to `?1` (NULL = internal). A project whose client
/// changes moves to the end of its new group (the projects with the same
/// `client_id`, or the internal ones); an unchanged client keeps its position.
/// The right-hand side reads the row as it was before the update. Shared with
/// `factory::ops::project_set` (the CLI's `project set --client`).
pub(crate) const SET_CLIENT_SQL: &str = r#"UPDATE projects SET
    position = CASE WHEN client_id IS ?1 THEN position
                    ELSE (SELECT COALESCE(MAX(g.position), -1) + 1 FROM projects g WHERE g.client_id IS ?1) END,
    client_id = ?1
  WHERE id = ?2"#;

#[derive(Debug, Deserialize)]
pub struct ProjectCreate {
    pub name: String,
    pub key: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub logo_data: Option<String>,
    /// The project's client; absent or NULL creates an internal project.
    pub client_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct ProjectUpdate {
    pub name: Option<String>,
    pub key: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub logo_data: Option<Option<String>>,
    /// Absent keeps the client, `null` makes the project internal, a value sets it.
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub client_id: Option<Option<i64>>,
}

#[tauri::command]
pub async fn create_project(
    pool: State<'_, SqlitePool>,
    payload: ProjectCreate,
) -> Result<Project, String> {
    let id: i64 = sqlx::query_scalar(
        r#"INSERT INTO projects (name, key, description, color, logo_data, client_id, created_at, position)
           VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                   (SELECT COALESCE(MAX(position), 0) + 1 FROM projects))
           RETURNING id"#,
    )
    .bind(&payload.name)
    .bind(&payload.key)
    .bind(payload.description.unwrap_or_default())
    .bind(payload.color.unwrap_or_else(|| "#6366f1".into()))
    .bind(payload.logo_data)
    .bind(payload.client_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    get_project(pool, id).await
}

#[tauri::command]
pub async fn list_projects(pool: State<'_, SqlitePool>) -> Result<Vec<Project>, String> {
    sqlx::query_as::<_, Project>(&format!("{PROJECT_SQL} ORDER BY position ASC, created_at DESC"))
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

async fn get_project_inner(pool: &SqlitePool, id: i64) -> Result<Project, String> {
    sqlx::query_as::<_, Project>(&format!("{PROJECT_SQL} WHERE id = ?"))
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_project(pool: State<'_, SqlitePool>, id: i64) -> Result<Project, String> {
    get_project_inner(pool.inner(), id).await
}

async fn update_project_inner(pool: &SqlitePool, id: i64, payload: ProjectUpdate) -> Result<Project, String> {
    let current = get_project_inner(pool, id).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query(
        "UPDATE projects SET name = ?, key = ?, description = ?, color = ?, logo_data = ? WHERE id = ?",
    )
    .bind(payload.name.unwrap_or(current.name))
    .bind(payload.key.unwrap_or(current.key))
    .bind(payload.description.unwrap_or(current.description))
    .bind(payload.color.unwrap_or(current.color))
    .bind(payload.logo_data.unwrap_or(current.logo_data))
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    if let Some(client_id) = payload.client_id {
        sqlx::query(SET_CLIENT_SQL)
            .bind(client_id)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;

    get_project_inner(pool, id).await
}

#[tauri::command]
pub async fn update_project(
    pool: State<'_, SqlitePool>,
    id: i64,
    payload: ProjectUpdate,
) -> Result<Project, String> {
    update_project_inner(pool.inner(), id, payload).await
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
    use super::{update_project_inner, Project, ProjectUpdate, PROJECT_SQL};
    use crate::test_support as ts;

    /// FB-202: `kind` is not stored; the Project JSON derives it from `client_id`.
    #[tokio::test]
    async fn project_kind_is_derived_from_its_client() {
        let pool = ts::pool().await;
        let internal = ts::project(&pool, "IN").await;
        let client_project = ts::project(&pool, "CL").await;
        let acme = ts::client(&pool, "Acme").await;
        sqlx::query("UPDATE projects SET client_id = ? WHERE id = ?")
            .bind(acme)
            .bind(client_project)
            .execute(&pool)
            .await
            .unwrap();
        let get = |id: i64| {
            let pool = pool.clone();
            async move {
                sqlx::query_as::<_, Project>(&format!("{PROJECT_SQL} WHERE id = ?"))
                    .bind(id)
                    .fetch_one(&pool)
                    .await
                    .unwrap()
            }
        };
        let project = get(internal).await;
        assert_eq!((project.client_id, project.kind.as_str()), (None, "internal"));
        let project = get(client_project).await;
        assert_eq!((project.client_id, project.kind.as_str()), (Some(acme), "client"));
        let json = serde_json::to_value(&project).unwrap();
        assert_eq!((json["kind"].clone(), json["client_id"].clone()), ("client".into(), acme.into()));
    }

    #[test]
    fn client_id_is_three_state() {
        let u: ProjectUpdate = serde_json::from_str(r#"{}"#).unwrap();
        assert_eq!(u.client_id, None, "absent must be outer None (keep current)");
        let u: ProjectUpdate = serde_json::from_str(r#"{"client_id": null}"#).unwrap();
        assert_eq!(u.client_id, Some(None), "null must be Some(None) (make internal)");
        let u: ProjectUpdate = serde_json::from_str(r#"{"client_id": 7}"#).unwrap();
        assert_eq!(u.client_id, Some(Some(7)));
    }

    fn update(json: &str) -> ProjectUpdate {
        serde_json::from_str(json).unwrap()
    }

    async fn position(pool: &sqlx::SqlitePool, id: i64) -> i64 {
        sqlx::query_scalar("SELECT position FROM projects WHERE id = ?").bind(id).fetch_one(pool).await.unwrap()
    }

    /// FB-204: a project whose client changes lands last in its new group; any
    /// other update, or setting the same client again, keeps its position.
    #[tokio::test]
    async fn a_project_that_changes_client_goes_last_in_its_new_group() {
        let pool = ts::pool().await;
        let acme = ts::client(&pool, "Acme").await;
        let a1 = ts::project(&pool, "A1").await;
        let a2 = ts::project(&pool, "A2").await;
        let i1 = ts::project(&pool, "I1").await;
        let i2 = ts::project(&pool, "I2").await;
        for (id, client, pos) in [(a1, Some(acme), 4), (a2, Some(acme), 7), (i1, None, 2), (i2, None, 9)] {
            sqlx::query("UPDATE projects SET client_id = ?, position = ? WHERE id = ?")
                .bind(client)
                .bind(pos)
                .bind(id)
                .execute(&pool)
                .await
                .unwrap();
        }

        // Internal -> Acme: after A2 (7), not after I2 (9).
        let moved = update_project_inner(&pool, i1, update(&format!(r#"{{"client_id": {acme}}}"#))).await.unwrap();
        assert_eq!((moved.client_id, moved.kind.as_str(), moved.position), (Some(acme), "client", 8));

        // Acme -> internal: after I2 (9).
        let moved = update_project_inner(&pool, a1, update(r#"{"client_id": null}"#)).await.unwrap();
        assert_eq!((moved.client_id, moved.kind.as_str(), moved.position), (None, "internal", 10));

        // Same client again, or no client field: position unchanged.
        update_project_inner(&pool, a2, update(&format!(r#"{{"client_id": {acme}, "name": "A2x"}}"#))).await.unwrap();
        update_project_inner(&pool, i2, update(r#"{"name": "I2x"}"#)).await.unwrap();
        assert_eq!((position(&pool, a2).await, position(&pool, i2).await), (7, 9));

        // An unknown client is refused and the whole update is rolled back.
        assert!(update_project_inner(&pool, i2, update(r#"{"client_id": 999, "name": "no"}"#)).await.is_err());
        let name: String = sqlx::query_scalar("SELECT name FROM projects WHERE id = ?").bind(i2).fetch_one(&pool).await.unwrap();
        assert_eq!(name, "I2x");

        // The CLI path (`project set --client`) applies the same rule.
        let beta = ts::client(&pool, "Beta").await;
        crate::factory::ops::project_set(&pool, "I2", None, Some(Some(beta))).await.unwrap();
        assert_eq!(position(&pool, i2).await, 0, "first in Beta's empty group");
    }

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
