//! The Story page (SF-61). Thin wrappers over the Factory's Story operations,
//! so the app reads the same Story view and trail as the CLI and MCP; the app
//! acts as the owner.

use crate::factory::ops::{self, Actor};
use serde_json::Value;
use sqlx::SqlitePool;
use tauri::State;

#[tauri::command]
pub async fn get_story(pool: State<'_, SqlitePool>, key: String) -> Result<Value, String> {
    ops::story_show(pool.inner(), &key).await
}

#[tauri::command]
pub async fn get_story_trail(pool: State<'_, SqlitePool>, key: String) -> Result<Value, String> {
    ops::trail(pool.inner(), &key).await
}

#[tauri::command]
pub async fn restart_run(pool: State<'_, SqlitePool>, key: String) -> Result<Value, String> {
    ops::run_restart(pool.inner(), &key, Actor::Owner).await
}

#[tauri::command]
pub async fn list_active_runs(pool: State<'_, SqlitePool>) -> Result<Value, String> {
    ops::active_runs(pool.inner()).await
}
