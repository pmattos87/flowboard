//! Shared fixtures for the Rust unit tests (compiled only under `cfg(test)`).
//!
//! Column values come from the current schema (`docs/SCHEMA.md`, migration 011's CHECKs), not
//! from the migration that first created a table: `type` and `status` are closed Rust types so a
//! test cannot insert a value the CHECK refuses (FB-255).

use crate::factory::ops;
use sqlx::SqlitePool;

/// Id of the first seeded person, "Pedro"; the Factory owner on a [`factory_project`].
pub const OWNER: i64 = 1;
/// Id of the second seeded person, "Claude"; the Factory agent on a [`factory_project`].
pub const AGENT: i64 = 2;

/// `tasks.type`, as migration 011's CHECK allows it.
#[derive(Debug, Clone, Copy)]
pub enum TaskType {
    Story,
    Bug,
    Subtask,
    Epic,
}

impl TaskType {
    pub const ALL: [TaskType; 4] = [TaskType::Story, TaskType::Bug, TaskType::Subtask, TaskType::Epic];

    pub fn as_str(self) -> &'static str {
        match self {
            TaskType::Story => "story",
            TaskType::Bug => "bug",
            TaskType::Subtask => "subtask",
            TaskType::Epic => "epic",
        }
    }
}

/// `tasks.status`, as migration 011's CHECK allows it: the legacy values (migration 008) and the
/// Factory values (migration 010).
#[derive(Debug, Clone, Copy)]
pub enum TaskStatus {
    // Legacy.
    Todo,
    InProgress,
    InReview,
    Refining,
    ReadyForDevelopment,
    Canceled,
    Done,
    // Factory.
    Backlog,
    Ready,
    Building,
    IntegratedTests,
    Tested,
    UserTesting,
}

impl TaskStatus {
    pub const ALL: [TaskStatus; 13] = [
        TaskStatus::Todo,
        TaskStatus::InProgress,
        TaskStatus::InReview,
        TaskStatus::Refining,
        TaskStatus::ReadyForDevelopment,
        TaskStatus::Canceled,
        TaskStatus::Done,
        TaskStatus::Backlog,
        TaskStatus::Ready,
        TaskStatus::Building,
        TaskStatus::IntegratedTests,
        TaskStatus::Tested,
        TaskStatus::UserTesting,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            TaskStatus::Todo => "todo",
            TaskStatus::InProgress => "in_progress",
            TaskStatus::InReview => "in_review",
            TaskStatus::Refining => "refining",
            TaskStatus::ReadyForDevelopment => "ready_for_development",
            TaskStatus::Canceled => "canceled",
            TaskStatus::Done => "done",
            TaskStatus::Backlog => "backlog",
            TaskStatus::Ready => "ready",
            TaskStatus::Building => "building",
            TaskStatus::IntegratedTests => "integrated_tests",
            TaskStatus::Tested => "tested",
            TaskStatus::UserTesting => "user_testing",
        }
    }
}

/// `sprints.status`, as migration 001's CHECK allows it.
#[derive(Debug, Clone, Copy)]
pub enum SprintStatus {
    Backlog,
    Active,
    Completed,
}

impl SprintStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            SprintStatus::Backlog => "backlog",
            SprintStatus::Active => "active",
            SprintStatus::Completed => "completed",
        }
    }
}

/// An in-memory database with every migration applied and two people seeded:
/// [`OWNER`] ("Pedro") and [`AGENT`] ("Claude"), neither holding a Factory role yet.
pub async fn pool() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    sqlx::query("INSERT INTO people (name, email) VALUES ('Pedro', 'p@test'), ('Claude', 'c@test')")
        .execute(&pool)
        .await
        .unwrap();
    pool
}

/// A legacy project whose name and key are both `key`; returns its id.
pub async fn project(pool: &SqlitePool, key: &str) -> i64 {
    sqlx::query_scalar("INSERT INTO projects (name, key, created_at) VALUES (?, ?, '2026-01-01T00:00:00.000Z') RETURNING id")
        .bind(key)
        .bind(key)
        .fetch_one(pool)
        .await
        .unwrap()
}

/// A Factory project, with [`OWNER`] and [`AGENT`] given those roles; returns its id.
/// Switched through `factory::ops`, as the app and CLI do.
pub async fn factory_project(pool: &SqlitePool, key: &str) -> i64 {
    let id = project(pool, key).await;
    ops::people_set_role(pool, OWNER, Some("owner")).await.unwrap();
    ops::people_set_role(pool, AGENT, Some("agent")).await.unwrap();
    ops::project_set(pool, key, Some("factory"), None).await.unwrap();
    id
}

/// A sprint starting and ending on `start`, with an empty goal; returns its id.
pub async fn sprint(pool: &SqlitePool, project_id: i64, name: &str, start: &str, status: SprintStatus) -> i64 {
    sqlx::query_scalar(
        r#"INSERT INTO sprints (project_id, name, goal, start_date, end_date, status)
           VALUES (?, ?, '', ?, ?, ?) RETURNING id"#,
    )
    .bind(project_id)
    .bind(name)
    .bind(start)
    .bind(start)
    .bind(status.as_str())
    .fetch_one(pool)
    .await
    .unwrap()
}

/// A task row inserted directly (no ladder checks), titled "t", with `created_at` and
/// `updated_at` at 2026-01-01T00:00:00.000Z and the project's next `task_number`; returns its id.
pub async fn task(
    pool: &SqlitePool,
    project_id: i64,
    sprint: Option<i64>,
    parent: Option<i64>,
    kind: TaskType,
    status: TaskStatus,
) -> i64 {
    sqlx::query_scalar(
        r#"INSERT INTO tasks (project_id, task_number, sprint_id, parent_id, title, type, status, created_at, updated_at)
           VALUES (?, (SELECT COALESCE(MAX(task_number), 0) + 1 FROM tasks WHERE project_id = ?), ?, ?, 't', ?, ?,
                   '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
           RETURNING id"#,
    )
    .bind(project_id)
    .bind(project_id)
    .bind(sprint)
    .bind(parent)
    .bind(kind.as_str())
    .bind(status.as_str())
    .fetch_one(pool)
    .await
    .unwrap()
}

mod tests {
    use super::*;

    #[tokio::test]
    async fn every_task_type_and_status_the_helper_offers_passes_the_schema_checks() {
        let pool = pool().await;
        let p = project(&pool, "LG").await;
        let f = factory_project(&pool, "SF").await;
        let s = sprint(&pool, p, "S1", "2026-10-01", SprintStatus::Active).await;
        for kind in TaskType::ALL {
            for status in TaskStatus::ALL {
                let id = task(&pool, p, Some(s), None, kind, status).await;
                let stored: (String, String) =
                    sqlx::query_as("SELECT type, status FROM tasks WHERE id = ?").bind(id).fetch_one(&pool).await.unwrap();
                assert_eq!(stored, (kind.as_str().to_string(), status.as_str().to_string()));
            }
        }
        let ladder: String = sqlx::query_scalar("SELECT ladder FROM projects WHERE id = ?").bind(f).fetch_one(&pool).await.unwrap();
        assert_eq!(ladder, "factory");

        // The CHECKs are live, so the loop above proves something: the pre-011 type is refused.
        let refused = sqlx::query(
            "INSERT INTO tasks (project_id, title, type, status, created_at, updated_at) VALUES (?, 't', 'task', 'todo', '', '')",
        )
        .bind(p)
        .execute(&pool)
        .await;
        assert!(refused.is_err(), "type 'task' must fail migration 011's CHECK");

        // The status CHECK is live too: a value outside migration 011's list is refused.
        let refused = sqlx::query(
            "INSERT INTO tasks (project_id, title, type, status, created_at, updated_at) VALUES (?, 't', 'story', 'open', '', '')",
        )
        .bind(p)
        .execute(&pool)
        .await;
        assert!(refused.is_err(), "status 'open' must fail migration 011's CHECK");
    }
}
