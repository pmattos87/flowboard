//! Clients (FB-202): an organization that groups its projects in the sidebar.
//! A client has a name and a sidebar position only; contacts stay CLI-only
//! (`factory::ops::contact_add/remove`).

use serde::Serialize;
use sqlx::{FromRow, SqlitePool};
use tauri::State;

#[derive(Debug, FromRow, Serialize)]
pub struct Client {
    pub id: i64,
    pub name: String,
    /// Manual sort order within the sidebar's Clients section (ascending).
    pub position: i64,
}

/// The trimmed name, or an error when it is blank (checked before any write).
fn clean_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("client name cannot be blank".into());
    }
    Ok(name)
}

async fn get_client(pool: &SqlitePool, id: i64) -> Result<Client, String> {
    sqlx::query_as::<_, Client>("SELECT id, name, position FROM clients WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("client {id} not found"))
}

async fn list_clients_inner(pool: &SqlitePool) -> Result<Vec<Client>, String> {
    sqlx::query_as::<_, Client>("SELECT id, name, position FROM clients ORDER BY position, id")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
}

/// A new client goes last in the Clients section.
async fn create_client_inner(pool: &SqlitePool, name: &str) -> Result<Client, String> {
    let name = clean_name(name)?;
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO clients (name, position) VALUES (?, (SELECT COALESCE(MAX(position), -1) + 1 FROM clients)) RETURNING id",
    )
    .bind(name)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    get_client(pool, id).await
}

async fn rename_client_inner(pool: &SqlitePool, id: i64, name: &str) -> Result<Client, String> {
    let name = clean_name(name)?;
    let updated = sqlx::query("UPDATE clients SET name = ? WHERE id = ?")
        .bind(name)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    if updated.rows_affected() == 0 {
        return Err(format!("client {id} not found"));
    }
    get_client(pool, id).await
}

/// Each client's `position` becomes its index in `ordered_ids`, in one transaction.
async fn reorder_clients_inner(pool: &SqlitePool, ordered_ids: &[i64]) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for (position, id) in ordered_ids.iter().enumerate() {
        sqlx::query("UPDATE clients SET position = ? WHERE id = ?")
            .bind(position as i64)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_clients(pool: State<'_, SqlitePool>) -> Result<Vec<Client>, String> {
    list_clients_inner(pool.inner()).await
}

#[tauri::command]
pub async fn create_client(pool: State<'_, SqlitePool>, name: String) -> Result<Client, String> {
    create_client_inner(pool.inner(), &name).await
}

#[tauri::command]
pub async fn rename_client(pool: State<'_, SqlitePool>, id: i64, name: String) -> Result<Client, String> {
    rename_client_inner(pool.inner(), id, &name).await
}

#[tauri::command]
pub async fn reorder_clients(pool: State<'_, SqlitePool>, ordered_ids: Vec<i64>) -> Result<(), String> {
    reorder_clients_inner(pool.inner(), &ordered_ids).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support as ts;

    async fn rows(pool: &SqlitePool) -> Vec<(i64, String, i64)> {
        sqlx::query_as("SELECT id, name, position FROM clients ORDER BY id")
            .fetch_all(pool)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn created_clients_go_last_and_names_are_trimmed() {
        let pool = ts::pool().await;
        let a = create_client_inner(&pool, "Acme").await.unwrap();
        let b = create_client_inner(&pool, "  Beta  ").await.unwrap();
        assert_eq!((a.name.as_str(), a.position), ("Acme", 0));
        assert_eq!((b.name.as_str(), b.position), ("Beta", 1));
    }

    #[tokio::test]
    async fn reorder_writes_each_position_as_its_index_and_list_follows_it() {
        let pool = ts::pool().await;
        let a = ts::client(&pool, "A").await;
        let b = ts::client(&pool, "B").await;
        let c = ts::client(&pool, "C").await;
        reorder_clients_inner(&pool, &[c, a, b]).await.unwrap();

        let positions: Vec<(i64, i64)> = rows(&pool).await.into_iter().map(|(id, _, p)| (id, p)).collect();
        assert_eq!(positions, vec![(a, 1), (b, 2), (c, 0)]);
        let listed: Vec<i64> = list_clients_inner(&pool).await.unwrap().into_iter().map(|c| c.id).collect();
        assert_eq!(listed, vec![c, a, b]);
    }

    #[tokio::test]
    async fn a_blank_name_is_refused_and_changes_no_row() {
        let pool = ts::pool().await;
        let a = ts::client(&pool, "Acme").await;
        let before = rows(&pool).await;

        for blank in ["", "   ", "\t\n"] {
            assert!(create_client_inner(&pool, blank).await.is_err(), "create {blank:?}");
            assert!(rename_client_inner(&pool, a, blank).await.is_err(), "rename {blank:?}");
        }
        assert_eq!(rows(&pool).await, before);
    }

    #[tokio::test]
    async fn rename_changes_only_the_name_and_refuses_an_unknown_client() {
        let pool = ts::pool().await;
        let a = ts::client(&pool, "Acme").await;
        let renamed = rename_client_inner(&pool, a, " Acme Corp ").await.unwrap();
        assert_eq!((renamed.id, renamed.name.as_str(), renamed.position), (a, "Acme Corp", 0));
        assert_eq!(rename_client_inner(&pool, 999, "X").await.unwrap_err(), "client 999 not found");
    }
}
