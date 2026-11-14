//! The company (SF-134): the owner of every internal project (`client_id IS
//! NULL`). One row, id 1, seeded 'Internal' by migration 017; its name and logo
//! head the sidebar's Internal section.

use super::clients::{clean_name, ClientUpdate};
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};
use tauri::State;

#[derive(Debug, FromRow, Serialize, PartialEq)]
pub struct Company {
    pub name: String,
    /// Optional logo as a base64 data URL (up to 512 px); NULL = no logo.
    pub logo_data: Option<String>,
}

async fn get_company_inner(pool: &SqlitePool) -> Result<Company, String> {
    sqlx::query_as::<_, Company>("SELECT name, logo_data FROM company WHERE id = 1")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

/// Same fields and three-state `logo_data` as a client edit.
async fn update_company_inner(pool: &SqlitePool, payload: ClientUpdate) -> Result<Company, String> {
    let name = payload.name.as_deref().map(|n| clean_name(n, "company")).transpose()?;
    sqlx::query(
        "UPDATE company SET name = COALESCE(?, name), logo_data = CASE WHEN ? THEN ? ELSE logo_data END WHERE id = 1",
    )
    .bind(name)
    .bind(payload.logo_data.is_some())
    .bind(payload.logo_data.flatten())
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    get_company_inner(pool).await
}

#[tauri::command]
pub async fn get_company(pool: State<'_, SqlitePool>) -> Result<Company, String> {
    get_company_inner(pool.inner()).await
}

#[tauri::command]
pub async fn update_company(pool: State<'_, SqlitePool>, payload: ClientUpdate) -> Result<Company, String> {
    update_company_inner(pool.inner(), payload).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support as ts;

    fn update(json: &str) -> ClientUpdate {
        serde_json::from_str(json).unwrap()
    }

    #[tokio::test]
    async fn the_company_is_seeded_internal_and_edits_its_one_row() {
        let pool = ts::pool().await;
        assert_eq!(get_company_inner(&pool).await.unwrap(), Company { name: "Internal".into(), logo_data: None });

        let set = update_company_inner(&pool, update(r#"{"name": " Mattos Dev ", "logo_data": "data:x"}"#)).await.unwrap();
        assert_eq!(set, Company { name: "Mattos Dev".into(), logo_data: Some("data:x".into()) });

        let kept = update_company_inner(&pool, update(r#"{"name": "Mattos"}"#)).await.unwrap();
        assert_eq!(kept.logo_data.as_deref(), Some("data:x"), "absent logo keeps it");

        let cleared = update_company_inner(&pool, update(r#"{"logo_data": null}"#)).await.unwrap();
        assert_eq!(cleared, Company { name: "Mattos".into(), logo_data: None });

        let rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM company").fetch_one(&pool).await.unwrap();
        assert_eq!(rows, 1);
    }

    #[tokio::test]
    async fn a_blank_company_name_is_refused_and_changes_nothing() {
        let pool = ts::pool().await;
        for blank in ["", "  ", "\t"] {
            let payload = ClientUpdate { name: Some(blank.into()), logo_data: Some(Some("data:x".into())) };
            let err = update_company_inner(&pool, payload).await.unwrap_err();
            assert_eq!(err, "company name cannot be blank");
        }
        assert_eq!(get_company_inner(&pool).await.unwrap(), Company { name: "Internal".into(), logo_data: None });
    }
}
