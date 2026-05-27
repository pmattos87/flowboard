use serde::{Deserialize, Deserializer, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

/// Distinguishes "field absent" from "field present and null" when deserializing
/// into `Option<Option<T>>`. Without this, serde's default impl collapses both
/// cases to `None`, making it impossible to clear a nullable column via JSON null.
fn deserialize_optional_field<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

#[derive(Debug, FromRow, Serialize)]
pub struct Task {
    pub id: i64,
    pub project_id: i64,
    pub task_number: i64,
    pub sprint_id: Option<i64>,
    pub parent_id: Option<i64>,
    pub title: String,
    pub description: String,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub r#type: String,
    pub status: String,
    pub priority: String,
    pub assignee_id: Option<i64>,
    pub story_points: i64,
    pub due_date: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub labels: String,
}

#[derive(Debug, Deserialize)]
pub struct TaskCreate {
    pub project_id: i64,
    pub sprint_id: Option<i64>,
    pub parent_id: Option<i64>,
    pub title: String,
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub r#type: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub assignee_id: Option<i64>,
    pub story_points: Option<i64>,
    pub due_date: Option<String>,
    pub labels: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TaskUpdate {
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub sprint_id: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub parent_id: Option<Option<i64>>,
    pub title: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub r#type: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub assignee_id: Option<Option<i64>>,
    pub story_points: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub due_date: Option<Option<String>>,
    pub labels: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct TaskListFilters {
    pub project_id: Option<i64>,
    pub sprint_id: Option<i64>,
    pub status: Option<String>,
    pub assignee_id: Option<i64>,
    pub parent_id: Option<i64>,
}

/// Resolve which person to attribute an activity-log event to.
/// Prefers the task's `assignee_id`; falls back to the first registered person.
/// Errors when both are absent (empty People table on first launch).
async fn resolve_actor_id(
    pool: &SqlitePool,
    assignee_id: Option<i64>,
) -> Result<i64, String> {
    if let Some(id) = assignee_id {
        return Ok(id);
    }
    let first: Option<i64> =
        sqlx::query_scalar("SELECT id FROM people ORDER BY id ASC LIMIT 1")
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;
    first.ok_or_else(|| {
        "Add at least one person before changing task status".to_string()
    })
}

pub async fn create_task_inner(
    pool: &SqlitePool,
    payload: TaskCreate,
) -> Result<Task, String> {
    let resolved_status = payload
        .status
        .clone()
        .unwrap_or_else(|| "todo".into());
    let actor_id = resolve_actor_id(pool, payload.assignee_id).await?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Per-project task number: MAX+1 inside the same transaction. The
    // UNIQUE(project_id, task_number) index guarantees no duplicate slips
    // through if two concurrent transactions race — the second commit fails.
    let next_task_number: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(task_number), 0) + 1 FROM tasks WHERE project_id = ?",
    )
    .bind(payload.project_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let id: i64 = sqlx::query_scalar(
        r#"INSERT INTO tasks (
            project_id, task_number, sprint_id, parent_id, title, description,
            type, status, priority, assignee_id, story_points,
            due_date, created_at, updated_at, labels
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            ?)
        RETURNING id"#,
    )
    .bind(payload.project_id)
    .bind(next_task_number)
    .bind(payload.sprint_id)
    .bind(payload.parent_id)
    .bind(&payload.title)
    .bind(payload.description.unwrap_or_default())
    .bind(payload.r#type.unwrap_or_else(|| "task".into()))
    .bind(&resolved_status)
    .bind(payload.priority.unwrap_or_else(|| "medium".into()))
    .bind(payload.assignee_id)
    .bind(payload.story_points.unwrap_or(0))
    .bind(payload.due_date)
    .bind(payload.labels.unwrap_or_default())
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"INSERT INTO activity_log (task_id, person_id, action, old_value, new_value, created_at)
           VALUES (?, ?, 'created', '', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))"#,
    )
    .bind(id)
    .bind(actor_id)
    .bind(&resolved_status)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    get_task_inner(pool, id).await
}

#[tauri::command]
pub async fn create_task(
    pool: State<'_, SqlitePool>,
    payload: TaskCreate,
) -> Result<Task, String> {
    create_task_inner(pool.inner(), payload).await
}

#[tauri::command]
pub async fn list_tasks(
    pool: State<'_, SqlitePool>,
    filters: Option<TaskListFilters>,
) -> Result<Vec<Task>, String> {
    let f = filters.unwrap_or_default();
    let mut sql = String::from("SELECT * FROM tasks WHERE 1=1");
    if f.project_id.is_some() {
        sql.push_str(" AND project_id = ?");
    }
    if f.sprint_id.is_some() {
        sql.push_str(" AND sprint_id = ?");
    }
    if f.status.is_some() {
        sql.push_str(" AND status = ?");
    }
    if f.assignee_id.is_some() {
        sql.push_str(" AND assignee_id = ?");
    }
    if f.parent_id.is_some() {
        sql.push_str(" AND parent_id = ?");
    }
    sql.push_str(" ORDER BY created_at DESC");

    let mut q = sqlx::query_as::<_, Task>(&sql);
    if let Some(v) = f.project_id {
        q = q.bind(v);
    }
    if let Some(v) = f.sprint_id {
        q = q.bind(v);
    }
    if let Some(v) = f.status {
        q = q.bind(v);
    }
    if let Some(v) = f.assignee_id {
        q = q.bind(v);
    }
    if let Some(v) = f.parent_id {
        q = q.bind(v);
    }

    q.fetch_all(pool.inner()).await.map_err(|e| e.to_string())
}

pub async fn get_task_inner(pool: &SqlitePool, id: i64) -> Result<Task, String> {
    sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_task(pool: State<'_, SqlitePool>, id: i64) -> Result<Task, String> {
    get_task_inner(pool.inner(), id).await
}

pub async fn update_task_inner(
    pool: &SqlitePool,
    id: i64,
    payload: TaskUpdate,
) -> Result<Task, String> {
    let current = get_task_inner(pool, id).await?;

    let new_sprint_id = payload.sprint_id.unwrap_or(current.sprint_id);
    let sprint_id_changed = new_sprint_id != current.sprint_id;
    let new_parent_id = payload.parent_id.unwrap_or(current.parent_id);
    let new_title = payload.title.unwrap_or(current.title.clone());
    let new_description = payload.description.unwrap_or(current.description.clone());
    let new_type = payload.r#type.unwrap_or(current.r#type.clone());
    let new_status = payload.status.unwrap_or(current.status.clone());
    let new_priority = payload.priority.unwrap_or(current.priority.clone());
    let new_assignee_id = payload.assignee_id.unwrap_or(current.assignee_id);
    let new_story_points = payload.story_points.unwrap_or(current.story_points);
    let new_due_date = payload.due_date.unwrap_or(current.due_date.clone());
    let new_labels = payload.labels.unwrap_or(current.labels.clone());

    let status_changed = new_status != current.status;

    // Resolve the actor up-front so we fail fast on an empty People table before
    // mutating any row. Use the new assignee if the row is being reassigned;
    // otherwise the current assignee; otherwise the first-person fallback.
    let actor_id: Option<i64> = if status_changed {
        Some(resolve_actor_id(pool, new_assignee_id).await?)
    } else {
        None
    };

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        r#"UPDATE tasks SET
            sprint_id    = ?,
            parent_id    = ?,
            title        = ?,
            description  = ?,
            type         = ?,
            status       = ?,
            priority     = ?,
            assignee_id  = ?,
            story_points = ?,
            due_date     = ?,
            labels       = ?,
            updated_at   = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE id = ?"#,
    )
    .bind(new_sprint_id)
    .bind(new_parent_id)
    .bind(&new_title)
    .bind(&new_description)
    .bind(&new_type)
    .bind(&new_status)
    .bind(&new_priority)
    .bind(new_assignee_id)
    .bind(new_story_points)
    .bind(&new_due_date)
    .bind(&new_labels)
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if status_changed {
        let actor = actor_id.expect("actor_id is Some when status_changed is true");
        sqlx::query(
            r#"INSERT INTO activity_log (task_id, person_id, action, old_value, new_value, created_at)
               VALUES (?, ?, 'status_changed', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))"#,
        )
        .bind(id)
        .bind(actor)
        .bind(&current.status)
        .bind(&new_status)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // When a story moves into or out of a sprint, its child tasks/bugs follow.
    // Same transaction so parent and children commit atomically.
    if sprint_id_changed && current.r#type == "story" {
        sqlx::query(
            r#"UPDATE tasks
                  SET sprint_id  = ?,
                      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                WHERE parent_id = ?"#,
        )
        .bind(new_sprint_id)
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    get_task_inner(pool, id).await
}

#[tauri::command]
pub async fn update_task(
    pool: State<'_, SqlitePool>,
    id: i64,
    payload: TaskUpdate,
) -> Result<Task, String> {
    update_task_inner(pool.inner(), id, payload).await
}

#[tauri::command]
pub async fn delete_task(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM tasks WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{create_task_inner, update_task_inner, TaskCreate, TaskUpdate};
    use sqlx::SqlitePool;

    #[test]
    fn absent_sprint_id_deserializes_to_none() {
        let json = r#"{}"#;
        let u: TaskUpdate = serde_json::from_str(json).unwrap();
        assert!(u.sprint_id.is_none(), "absent field must be outer None");
    }

    #[test]
    fn null_sprint_id_deserializes_to_some_none() {
        let json = r#"{"sprint_id": null}"#;
        let u: TaskUpdate = serde_json::from_str(json).unwrap();
        assert_eq!(u.sprint_id, Some(None), "null must be Some(None) to clear column");
    }

    #[test]
    fn value_sprint_id_deserializes_to_some_some() {
        let json = r#"{"sprint_id": 7}"#;
        let u: TaskUpdate = serde_json::from_str(json).unwrap();
        assert_eq!(u.sprint_id, Some(Some(7)));
    }

    #[test]
    fn null_handling_applies_to_all_nullable_fields() {
        let json = r#"{"sprint_id": null, "parent_id": null, "assignee_id": null, "due_date": null}"#;
        let u: TaskUpdate = serde_json::from_str(json).unwrap();
        assert_eq!(u.sprint_id, Some(None));
        assert_eq!(u.parent_id, Some(None));
        assert_eq!(u.assignee_id, Some(None));
        assert_eq!(u.due_date, Some(None));
    }

    // ─── Activity logging (Phase 7 / Prep-0) ────────────────────────────────

    async fn new_test_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    async fn seed_project(pool: &SqlitePool) -> i64 {
        sqlx::query_scalar::<_, i64>(
            r#"INSERT INTO projects (name, key, created_at)
               VALUES ('P', 'P', '2026-01-01T00:00:00.000Z')
               RETURNING id"#,
        )
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn seed_person(pool: &SqlitePool, name: &str) -> i64 {
        sqlx::query_scalar::<_, i64>(
            "INSERT INTO people (name, email) VALUES (?, ?) RETURNING id",
        )
        .bind(name)
        .bind(format!("{name}@test"))
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn count_activity(pool: &SqlitePool, task_id: i64) -> i64 {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM activity_log WHERE task_id = ?")
            .bind(task_id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    fn empty_update() -> TaskUpdate {
        TaskUpdate {
            sprint_id: None,
            parent_id: None,
            title: None,
            description: None,
            r#type: None,
            status: None,
            priority: None,
            assignee_id: None,
            story_points: None,
            due_date: None,
            labels: None,
        }
    }

    #[tokio::test]
    async fn create_task_writes_created_activity_log() {
        let pool = new_test_pool().await;
        let project_id = seed_project(&pool).await;
        let person_id = seed_person(&pool, "Alice").await;

        let task = create_task_inner(
            &pool,
            TaskCreate {
                project_id,
                sprint_id: None,
                parent_id: None,
                title: "T".into(),
                description: None,
                r#type: None,
                status: None,
                priority: None,
                assignee_id: Some(person_id),
                story_points: None,
                due_date: None,
                labels: None,
            },
        )
        .await
        .unwrap();

        let row: (i64, String, String, String) = sqlx::query_as(
            "SELECT person_id, action, old_value, new_value FROM activity_log WHERE task_id = ?",
        )
        .bind(task.id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.0, person_id);
        assert_eq!(row.1, "created");
        assert_eq!(row.2, "");
        assert_eq!(row.3, "todo");
    }

    #[tokio::test]
    async fn status_change_creates_activity_row() {
        let pool = new_test_pool().await;
        let project_id = seed_project(&pool).await;
        let person_id = seed_person(&pool, "Alice").await;

        let task = create_task_inner(
            &pool,
            TaskCreate {
                project_id,
                sprint_id: None,
                parent_id: None,
                title: "T".into(),
                description: None,
                r#type: None,
                status: None,
                priority: None,
                assignee_id: Some(person_id),
                story_points: None,
                due_date: None,
                labels: None,
            },
        )
        .await
        .unwrap();

        update_task_inner(
            &pool,
            task.id,
            TaskUpdate {
                status: Some("in_progress".into()),
                ..empty_update()
            },
        )
        .await
        .unwrap();

        assert_eq!(count_activity(&pool, task.id).await, 2);

        let last: (String, String, String) = sqlx::query_as(
            "SELECT action, old_value, new_value FROM activity_log
             WHERE task_id = ? ORDER BY id DESC LIMIT 1",
        )
        .bind(task.id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(last.0, "status_changed");
        assert_eq!(last.1, "todo");
        assert_eq!(last.2, "in_progress");
    }

    #[tokio::test]
    async fn non_status_update_does_not_log_status_change() {
        let pool = new_test_pool().await;
        let project_id = seed_project(&pool).await;
        let person_id = seed_person(&pool, "Alice").await;

        let task = create_task_inner(
            &pool,
            TaskCreate {
                project_id,
                sprint_id: None,
                parent_id: None,
                title: "T".into(),
                description: None,
                r#type: None,
                status: None,
                priority: None,
                assignee_id: Some(person_id),
                story_points: None,
                due_date: None,
                labels: None,
            },
        )
        .await
        .unwrap();

        update_task_inner(
            &pool,
            task.id,
            TaskUpdate {
                priority: Some("high".into()),
                ..empty_update()
            },
        )
        .await
        .unwrap();

        // Only the 'created' row should exist; no status_changed.
        assert_eq!(count_activity(&pool, task.id).await, 1);
    }

    #[tokio::test]
    async fn unassigned_task_uses_first_person_fallback() {
        let pool = new_test_pool().await;
        let project_id = seed_project(&pool).await;
        let first_id = seed_person(&pool, "First").await;
        let _second_id = seed_person(&pool, "Second").await;

        let task = create_task_inner(
            &pool,
            TaskCreate {
                project_id,
                sprint_id: None,
                parent_id: None,
                title: "T".into(),
                description: None,
                r#type: None,
                status: None,
                priority: None,
                assignee_id: None, // unassigned
                story_points: None,
                due_date: None,
                labels: None,
            },
        )
        .await
        .unwrap();

        update_task_inner(
            &pool,
            task.id,
            TaskUpdate {
                status: Some("done".into()),
                ..empty_update()
            },
        )
        .await
        .unwrap();

        let actors: Vec<i64> = sqlx::query_scalar(
            "SELECT person_id FROM activity_log WHERE task_id = ? ORDER BY id",
        )
        .bind(task.id)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(actors, vec![first_id, first_id]);
    }

    #[tokio::test]
    async fn empty_people_table_returns_actionable_error() {
        let pool = new_test_pool().await;
        let project_id = seed_project(&pool).await;
        // Intentionally no people seeded.

        let err = create_task_inner(
            &pool,
            TaskCreate {
                project_id,
                sprint_id: None,
                parent_id: None,
                title: "T".into(),
                description: None,
                r#type: None,
                status: None,
                priority: None,
                assignee_id: None,
                story_points: None,
                due_date: None,
                labels: None,
            },
        )
        .await
        .expect_err("create_task must error when no actor is available");
        assert!(
            err.contains("Add at least one person"),
            "error must guide the user to add a person, got: {err}"
        );

        // And the failed call must not have inserted a tasks row.
        let task_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(task_count, 0);
    }

    // ─── Sprint cascade (Phase 10 / Task 10.5) ─────────────────────────────

    async fn seed_sprint(pool: &SqlitePool, project_id: i64, name: &str) -> i64 {
        sqlx::query_scalar::<_, i64>(
            r#"INSERT INTO sprints (project_id, name, goal, start_date, end_date, status)
               VALUES (?, ?, '', '2026-01-01', '2026-01-14', 'backlog')
               RETURNING id"#,
        )
        .bind(project_id)
        .bind(name)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn sprint_of(pool: &SqlitePool, task_id: i64) -> Option<i64> {
        sqlx::query_scalar("SELECT sprint_id FROM tasks WHERE id = ?")
            .bind(task_id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    async fn create_typed(
        pool: &SqlitePool,
        project_id: i64,
        person_id: i64,
        t: &str,
        parent_id: Option<i64>,
        sprint_id: Option<i64>,
    ) -> i64 {
        create_task_inner(
            pool,
            TaskCreate {
                project_id,
                sprint_id,
                parent_id,
                title: t.into(),
                description: None,
                r#type: Some(t.into()),
                status: None,
                priority: None,
                assignee_id: Some(person_id),
                story_points: None,
                due_date: None,
                labels: None,
            },
        )
        .await
        .unwrap()
        .id
    }

    #[tokio::test]
    async fn propagates_sprint_id_to_children_when_story_moved() {
        let pool = new_test_pool().await;
        let project_id = seed_project(&pool).await;
        let person_id = seed_person(&pool, "Alice").await;
        let sprint_id = seed_sprint(&pool, project_id, "S1").await;

        let story_id = create_typed(&pool, project_id, person_id, "story", None, None).await;
        let child_task = create_typed(&pool, project_id, person_id, "task", Some(story_id), None).await;
        let child_bug = create_typed(&pool, project_id, person_id, "bug", Some(story_id), None).await;

        // Move story into sprint.
        update_task_inner(
            &pool,
            story_id,
            TaskUpdate { sprint_id: Some(Some(sprint_id)), ..empty_update() },
        )
        .await
        .unwrap();

        assert_eq!(sprint_of(&pool, story_id).await, Some(sprint_id));
        assert_eq!(sprint_of(&pool, child_task).await, Some(sprint_id));
        assert_eq!(sprint_of(&pool, child_bug).await, Some(sprint_id));

        // Clear story sprint — children should clear too.
        update_task_inner(
            &pool,
            story_id,
            TaskUpdate { sprint_id: Some(None), ..empty_update() },
        )
        .await
        .unwrap();

        assert_eq!(sprint_of(&pool, story_id).await, None);
        assert_eq!(sprint_of(&pool, child_task).await, None);
        assert_eq!(sprint_of(&pool, child_bug).await, None);
    }

    #[tokio::test]
    async fn does_not_propagate_when_non_story_sprint_changed() {
        let pool = new_test_pool().await;
        let project_id = seed_project(&pool).await;
        let person_id = seed_person(&pool, "Alice").await;
        let sprint_id = seed_sprint(&pool, project_id, "S1").await;

        // A plain task with no children of its own.
        let task_id = create_typed(&pool, project_id, person_id, "task", None, None).await;
        // Sibling task that should not be touched.
        let sibling_id = create_typed(&pool, project_id, person_id, "task", None, None).await;

        update_task_inner(
            &pool,
            task_id,
            TaskUpdate { sprint_id: Some(Some(sprint_id)), ..empty_update() },
        )
        .await
        .unwrap();

        assert_eq!(sprint_of(&pool, task_id).await, Some(sprint_id));
        assert_eq!(sprint_of(&pool, sibling_id).await, None);
    }

    #[tokio::test]
    async fn does_not_clobber_grandchildren() {
        // tasks today don't nest below a task, but defend the invariant: the
        // cascade is a single UPDATE on rows whose parent_id == story.id. A
        // grandchild (parent_id == child_task_id) must not be moved.
        let pool = new_test_pool().await;
        let project_id = seed_project(&pool).await;
        let person_id = seed_person(&pool, "Alice").await;
        let sprint_id = seed_sprint(&pool, project_id, "S1").await;

        let story_id = create_typed(&pool, project_id, person_id, "story", None, None).await;
        let child_id = create_typed(&pool, project_id, person_id, "task", Some(story_id), None).await;
        let grandchild_id = create_typed(&pool, project_id, person_id, "task", Some(child_id), None).await;

        update_task_inner(
            &pool,
            story_id,
            TaskUpdate { sprint_id: Some(Some(sprint_id)), ..empty_update() },
        )
        .await
        .unwrap();

        assert_eq!(sprint_of(&pool, child_id).await, Some(sprint_id));
        assert_eq!(sprint_of(&pool, grandchild_id).await, None);
    }

    #[tokio::test]
    async fn no_op_sprint_update_does_not_touch_children() {
        let pool = new_test_pool().await;
        let project_id = seed_project(&pool).await;
        let person_id = seed_person(&pool, "Alice").await;
        let sprint_id = seed_sprint(&pool, project_id, "S1").await;

        // Story already in the sprint; child has been manually pulled out into backlog.
        let story_id = create_typed(&pool, project_id, person_id, "story", None, Some(sprint_id)).await;
        let child_id = create_typed(&pool, project_id, person_id, "task", Some(story_id), None).await;

        // Re-apply the same sprint_id — sprint_id_changed is false, so no cascade fires.
        update_task_inner(
            &pool,
            story_id,
            TaskUpdate { sprint_id: Some(Some(sprint_id)), ..empty_update() },
        )
        .await
        .unwrap();

        assert_eq!(sprint_of(&pool, child_id).await, None);
    }

    // ─── Per-project task numbering ─────────────────────────────────────────

    async fn seed_named_project(pool: &SqlitePool, key: &str) -> i64 {
        sqlx::query_scalar::<_, i64>(
            r#"INSERT INTO projects (name, key, created_at)
               VALUES (?, ?, '2026-01-01T00:00:00.000Z')
               RETURNING id"#,
        )
        .bind(key)
        .bind(key)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn task_number_restarts_per_project() {
        let pool = new_test_pool().await;
        let p1 = seed_named_project(&pool, "P1").await;
        let p2 = seed_named_project(&pool, "P2").await;
        let person_id = seed_person(&pool, "Alice").await;

        let p1_first = create_typed(&pool, p1, person_id, "task", None, None).await;
        let p1_second = create_typed(&pool, p1, person_id, "task", None, None).await;
        let p2_first = create_typed(&pool, p2, person_id, "task", None, None).await;

        let n: (i64, i64, i64) = sqlx::query_as(
            "SELECT
               (SELECT task_number FROM tasks WHERE id = ?),
               (SELECT task_number FROM tasks WHERE id = ?),
               (SELECT task_number FROM tasks WHERE id = ?)",
        )
        .bind(p1_first)
        .bind(p1_second)
        .bind(p2_first)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(n, (1, 2, 1));
    }

    #[tokio::test]
    async fn deleting_task_leaves_gap_does_not_reuse_number() {
        // Documents the chosen behavior: MAX+1, not "first free slot".
        let pool = new_test_pool().await;
        let project_id = seed_project(&pool).await;
        let person_id = seed_person(&pool, "Alice").await;

        let first = create_typed(&pool, project_id, person_id, "task", None, None).await;
        let _second = create_typed(&pool, project_id, person_id, "task", None, None).await;

        sqlx::query("DELETE FROM tasks WHERE id = ?")
            .bind(first)
            .execute(&pool)
            .await
            .unwrap();

        let third = create_typed(&pool, project_id, person_id, "task", None, None).await;
        let n: i64 = sqlx::query_scalar("SELECT task_number FROM tasks WHERE id = ?")
            .bind(third)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 3, "deleted number 1 is not reused");
    }
}
