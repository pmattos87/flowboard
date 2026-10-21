//! The Releases page (SF-44). Thin wrappers over the Factory's Release
//! operations, so the app gets the same refusals as the CLI and MCP; the app
//! acts as the owner.

use crate::factory::ops::{self, Actor};
use serde_json::Value;
use sqlx::SqlitePool;
use tauri::State;

#[tauri::command]
pub async fn list_releases(pool: State<'_, SqlitePool>, project_key: String) -> Result<Value, String> {
    ops::release_list(pool.inner(), &project_key).await
}

#[tauri::command]
pub async fn get_release(pool: State<'_, SqlitePool>, project_key: String, version: String) -> Result<Value, String> {
    ops::release_show(pool.inner(), &project_key, &version).await
}

#[tauri::command]
pub async fn create_release(pool: State<'_, SqlitePool>, project_key: String, version: String) -> Result<Value, String> {
    ops::release_create(pool.inner(), &project_key, &version).await
}

#[tauri::command]
pub async fn pick_release_story(pool: State<'_, SqlitePool>, version: String, story_key: String) -> Result<Value, String> {
    ops::release_pick(pool.inner(), &version, &story_key, Actor::Owner).await
}

#[tauri::command]
pub async fn remove_release_story(pool: State<'_, SqlitePool>, story_key: String) -> Result<Value, String> {
    ops::release_remove(pool.inner(), &story_key, Actor::Owner).await
}
