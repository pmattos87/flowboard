use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

/// Columns returned to the frontend. Deliberately excludes the `content` BLOB
/// so listing attachments never ships file bytes across the IPC boundary.
const ATTACHMENT_COLUMNS: &str = "id, task_id, filename, filepath, size, mime_type, uploaded_at";

#[derive(Debug, FromRow, Serialize)]
pub struct Attachment {
    pub id: i64,
    pub task_id: i64,
    pub filename: String,
    pub filepath: String,
    pub size: i64,
    pub mime_type: String,
    pub uploaded_at: String,
}

#[derive(Debug, Deserialize)]
pub struct AttachmentCreate {
    pub task_id: i64,
    pub filename: String,
    pub filepath: String,
    pub mime_type: String,
}

async fn fetch_attachment(pool: &SqlitePool, id: i64) -> Result<Attachment, String> {
    sqlx::query_as::<_, Attachment>(&format!(
        "SELECT {ATTACHMENT_COLUMNS} FROM attachments WHERE id = ?"
    ))
    .bind(id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())
}

/// Reads the picked file's bytes (Rust-side, so they never cross IPC) and stores
/// them as a BLOB. `size` is derived from the actual byte length.
async fn create_attachment_inner(
    pool: &SqlitePool,
    payload: AttachmentCreate,
) -> Result<Attachment, String> {
    let content = std::fs::read(&payload.filepath)
        .map_err(|e| format!("failed to read file '{}': {e}", payload.filepath))?;
    let size = content.len() as i64;

    let id: i64 = sqlx::query_scalar(
        r#"INSERT INTO attachments (task_id, filename, filepath, size, mime_type, content, uploaded_at)
           VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           RETURNING id"#,
    )
    .bind(payload.task_id)
    .bind(&payload.filename)
    .bind(&payload.filepath)
    .bind(size)
    .bind(&payload.mime_type)
    .bind(&content)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    fetch_attachment(pool, id).await
}

#[tauri::command]
pub async fn create_attachment(
    pool: State<'_, SqlitePool>,
    payload: AttachmentCreate,
) -> Result<Attachment, String> {
    create_attachment_inner(pool.inner(), payload).await
}

#[tauri::command]
pub async fn list_attachments(
    pool: State<'_, SqlitePool>,
    task_id: i64,
) -> Result<Vec<Attachment>, String> {
    sqlx::query_as::<_, Attachment>(&format!(
        "SELECT {ATTACHMENT_COLUMNS} FROM attachments WHERE task_id = ? ORDER BY uploaded_at DESC"
    ))
    .bind(task_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_attachment(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM attachments WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Materializes the stored bytes into a temp file and opens it with the OS
/// default program. Legacy rows that predate BLOB storage (content NULL) fall
/// back to opening the original on-disk path.
#[tauri::command]
pub async fn open_attachment(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<(), String> {
    let (filename, content, filepath): (String, Option<Vec<u8>>, String) =
        sqlx::query_as("SELECT filename, content, filepath FROM attachments WHERE id = ?")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    let target = match content {
        Some(bytes) => {
            let dir = app
                .path()
                .temp_dir()
                .map_err(|e| e.to_string())?
                .join("flowboard-attachments");
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let path = dir.join(format!("{id}-{filename}"));
            std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
            path.to_string_lossy().into_owned()
        }
        None => filepath,
    };

    app.opener()
        .open_path(target, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn new_test_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    async fn seed_task(pool: &SqlitePool) -> i64 {
        let project_id: i64 = sqlx::query_scalar(
            r#"INSERT INTO projects (name, key, created_at)
               VALUES ('P', 'P', '2026-01-01T00:00:00.000Z') RETURNING id"#,
        )
        .fetch_one(pool)
        .await
        .unwrap();
        sqlx::query_scalar(
            r#"INSERT INTO tasks (project_id, title, created_at, updated_at)
               VALUES (?, 'T', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
               RETURNING id"#,
        )
        .bind(project_id)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn create_attachment_stores_file_bytes_in_db() {
        let pool = new_test_pool().await;
        let task_id = seed_task(&pool).await;

        // A real temp file to attach.
        let mut path = std::env::temp_dir();
        path.push(format!("fb-attach-test-{}.txt", std::process::id()));
        let bytes = b"hello flowboard attachment".to_vec();
        std::fs::write(&path, &bytes).unwrap();

        let created = create_attachment_inner(
            &pool,
            AttachmentCreate {
                task_id,
                filename: "note.txt".into(),
                filepath: path.to_string_lossy().into_owned(),
                mime_type: "text/plain".into(),
            },
        )
        .await
        .unwrap();

        // size is derived from the bytes; mime is persisted.
        assert_eq!(created.size, bytes.len() as i64);
        assert_eq!(created.mime_type, "text/plain");

        // The bytes round-trip identically out of the BLOB column...
        let stored: Vec<u8> = sqlx::query_scalar("SELECT content FROM attachments WHERE id = ?")
            .bind(created.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(stored, bytes);

        // ...and survive deleting the original file (it now lives in the DB).
        std::fs::remove_file(&path).unwrap();
        let fetched = fetch_attachment(&pool, created.id).await.unwrap();
        assert_eq!(fetched.size, bytes.len() as i64);
    }

    #[tokio::test]
    async fn create_attachment_errors_when_file_missing() {
        let pool = new_test_pool().await;
        let task_id = seed_task(&pool).await;

        let result = create_attachment_inner(
            &pool,
            AttachmentCreate {
                task_id,
                filename: "ghost.txt".into(),
                filepath: "/no/such/file/anywhere.txt".into(),
                mime_type: "text/plain".into(),
            },
        )
        .await;

        assert!(result.is_err());
        // Nothing should have been inserted.
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM attachments")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }
}
