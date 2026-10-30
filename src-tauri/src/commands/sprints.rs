use serde::{Deserialize, Serialize};
use crate::factory;
use sqlx::{FromRow, Sqlite, SqlitePool, Transaction};
use tauri::State;

#[derive(Debug, FromRow, Serialize)]
pub struct Sprint {
    pub id: i64,
    pub project_id: i64,
    pub name: String,
    pub goal: String,
    pub start_date: String,
    pub end_date: String,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct SprintCreate {
    pub project_id: i64,
    pub name: String,
    pub goal: Option<String>,
    pub start_date: String,
    pub end_date: String,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SprintUpdate {
    pub name: Option<String>,
    pub goal: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub status: Option<String>,
}

#[tauri::command]
pub async fn create_sprint(
    pool: State<'_, SqlitePool>,
    payload: SprintCreate,
) -> Result<Sprint, String> {
    let id: i64 = sqlx::query_scalar(
        r#"INSERT INTO sprints (project_id, name, goal, start_date, end_date, status)
           VALUES (?, ?, ?, ?, ?, ?) RETURNING id"#,
    )
    .bind(payload.project_id)
    .bind(&payload.name)
    .bind(payload.goal.unwrap_or_default())
    .bind(&payload.start_date)
    .bind(&payload.end_date)
    .bind(payload.status.unwrap_or_else(|| "backlog".into()))
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    get_sprint(pool, id).await
}

#[tauri::command]
pub async fn list_sprints(
    pool: State<'_, SqlitePool>,
    project_id: Option<i64>,
) -> Result<Vec<Sprint>, String> {
    match project_id {
        Some(pid) => sqlx::query_as::<_, Sprint>(
            "SELECT * FROM sprints WHERE project_id = ? ORDER BY start_date DESC",
        )
        .bind(pid)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string()),
        None => sqlx::query_as::<_, Sprint>("SELECT * FROM sprints ORDER BY start_date DESC")
            .fetch_all(pool.inner())
            .await
            .map_err(|e| e.to_string()),
    }
}

pub async fn get_sprint_inner(pool: &SqlitePool, id: i64) -> Result<Sprint, String> {
    sqlx::query_as::<_, Sprint>("SELECT * FROM sprints WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sprint(pool: State<'_, SqlitePool>, id: i64) -> Result<Sprint, String> {
    get_sprint_inner(pool.inner(), id).await
}

pub async fn update_sprint_inner(
    pool: &SqlitePool,
    id: i64,
    payload: SprintUpdate,
) -> Result<Sprint, String> {
    let current = get_sprint_inner(pool, id).await?;
    // Only `complete_sprint` completes a sprint, so its unfinished issues
    // always carry over (FB-97). A completed sprint stays editable.
    if payload.status.as_deref() == Some("completed") && current.status != "completed" {
        return Err("a sprint is completed only with the Complete sprint action".into());
    }
    sqlx::query(
        "UPDATE sprints SET name = ?, goal = ?, start_date = ?, end_date = ?, status = ? WHERE id = ?",
    )
    .bind(payload.name.unwrap_or(current.name))
    .bind(payload.goal.unwrap_or(current.goal))
    .bind(payload.start_date.unwrap_or(current.start_date))
    .bind(payload.end_date.unwrap_or(current.end_date))
    .bind(payload.status.unwrap_or(current.status))
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    get_sprint_inner(pool, id).await
}

#[tauri::command]
pub async fn update_sprint(
    pool: State<'_, SqlitePool>,
    id: i64,
    payload: SprintUpdate,
) -> Result<Sprint, String> {
    update_sprint_inner(pool.inner(), id, payload).await
}

#[tauri::command]
pub async fn delete_sprint(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM sprints WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Complete sprint (FB-97) ────────────────────────────────────────────────

/// Where `complete_sprint` carries the unfinished issues. JSON:
/// `{ "kind": "sprint", "sprintId": 7 }`, `{ "kind": "backlog" }`, or
/// `{ "kind": "new", "name": "S2", "startDate": "2026-11-01", "endDate": "2026-11-14" }`.
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum CompleteTarget {
    Sprint {
        #[serde(rename = "sprintId")]
        sprint_id: i64,
    },
    Backlog,
    New {
        name: String,
        #[serde(rename = "startDate")]
        start_date: String,
        #[serde(rename = "endDate")]
        end_date: String,
    },
}

const UNFINISHED: &str = "status NOT IN ('done','canceled')";

/// Complete an active sprint: every unfinished issue in it (not done, not
/// canceled) moves to `target` and the sprint becomes `completed`, all in one
/// transaction, so a refusal changes nothing.
///
/// - Stories keep their status, except legacy Stories sent to Backlog, which go
///   back to `ready_for_development` (the sprint-drop transition) with a
///   `status_changed` row. Their child rows follow whatever their own status.
/// - Factory Stories move through `factory::ops`, so a Story past `ready`
///   refuses Backlog there. Their Subtasks follow them.
/// - Every other unfinished row moves with `sprint_id` alone.
/// - A done Story with an unfinished child refuses the completion.
/// - The destination sprint keeps its status; a new one starts in `backlog`.
pub async fn complete_sprint_inner(
    pool: &SqlitePool,
    sprint_id: i64,
    target: CompleteTarget,
) -> Result<Sprint, String> {
    let e = |e: sqlx::Error| e.to_string();
    let mut tx = pool.begin().await.map_err(e)?;

    let source = sqlx::query_as::<_, Sprint>("SELECT * FROM sprints WHERE id = ?")
        .bind(sprint_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(e)?
        .ok_or_else(|| format!("sprint {sprint_id} not found"))?;
    if source.status != "active" {
        return Err(format!(
            "only an active sprint can be completed; {} is {}",
            source.name, source.status
        ));
    }
    let (project_key, ladder): (String, String) =
        sqlx::query_as("SELECT key, ladder FROM projects WHERE id = ?")
            .bind(source.project_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(e)?;

    let dest: Option<i64> = match target {
        CompleteTarget::Backlog => None,
        CompleteTarget::Sprint { sprint_id: id } => {
            let t = sqlx::query_as::<_, Sprint>("SELECT * FROM sprints WHERE id = ?")
                .bind(id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(e)?
                .ok_or_else(|| format!("sprint {id} not found"))?;
            if t.id == source.id {
                return Err("a sprint cannot carry its issues over into itself".into());
            }
            if t.project_id != source.project_id {
                return Err(format!("{} belongs to another project", t.name));
            }
            if t.status == "completed" {
                return Err(format!("{} is already completed", t.name));
            }
            Some(t.id)
        }
        CompleteTarget::New { name, start_date, end_date } => {
            if name.trim().is_empty() {
                return Err("the new sprint needs a name".into());
            }
            let id: i64 = sqlx::query_scalar(
                r#"INSERT INTO sprints (project_id, name, goal, start_date, end_date, status)
                   VALUES (?, ?, '', ?, ?, 'backlog') RETURNING id"#,
            )
            .bind(source.project_id)
            .bind(name.trim())
            .bind(&start_date)
            .bind(&end_date)
            .fetch_one(&mut *tx)
            .await
            .map_err(e)?;
            Some(id)
        }
    };

    // A done Story still holding unfinished children can't be closed out. On a Factory
    // project a bug Story counts too (FB-52); a legacy project keeps `type = 'story'`.
    // Mirrors `openSubtasksUnderDoneStories` in src/lib/sprintCompletion.ts.
    let is_story = if ladder == "factory" {
        factory::ops::story_level_sql("s")
    } else {
        "s.type = 'story'".to_string()
    };
    let blocked: Vec<(i64, i64)> = sqlx::query_as(&format!(
        r#"SELECT s.task_number, c.task_number FROM tasks s JOIN tasks c ON c.parent_id = s.id
            WHERE s.sprint_id = ? AND {is_story} AND s.status = 'done' AND c.{UNFINISHED}
            ORDER BY s.task_number, c.task_number"#
    ))
    .bind(sprint_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(e)?;
    if !blocked.is_empty() {
        let mut parts: Vec<(i64, Vec<String>)> = Vec::new();
        for (story, child) in blocked {
            let key = format!("{project_key}-{child}");
            match parts.last_mut() {
                Some((s, children)) if *s == story => children.push(key),
                _ => parts.push((story, vec![key])),
            }
        }
        let list = parts
            .into_iter()
            .map(|(s, c)| format!("{project_key}-{s} is done but has open Subtasks ({})", c.join(", ")))
            .collect::<Vec<_>>()
            .join("; ");
        return Err(format!("{list}; close or cancel them before completing the sprint"));
    }

    if ladder == "factory" {
        // Story level: a feature Story or a bug Story (FB-52).
        let stories: Vec<i64> = sqlx::query_scalar(&format!(
            r#"SELECT id FROM tasks WHERE sprint_id = ? AND {}
                 AND {UNFINISHED} ORDER BY task_number"#,
            factory::ops::story_level_sql("tasks")
        ))
        .bind(sprint_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(e)?;
        for id in stories {
            factory::ops::app_story_set_sprint(&mut tx, id, dest).await?;
        }
    } else {
        let stories: Vec<(i64, String, Option<i64>)> = sqlx::query_as(&format!(
            r#"SELECT id, status, assignee_id FROM tasks
                WHERE sprint_id = ? AND type = 'story' AND {UNFINISHED} ORDER BY task_number"#
        ))
        .bind(sprint_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(e)?;
        for (id, status, assignee) in stories {
            // The Story and its children, as `update_task` moves them.
            sqlx::query(
                r#"UPDATE tasks SET sprint_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                    WHERE id = ? OR parent_id = ?"#,
            )
            .bind(dest)
            .bind(id)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(e)?;
            if dest.is_none() && status != "ready_for_development" {
                reset_to_discovery(&mut tx, id, &status, assignee).await?;
            }
        }
    }

    // Whatever is still unfinished here: top-level tasks and bugs, and children
    // whose parent stays behind. They keep their status.
    sqlx::query(&format!(
        r#"UPDATE tasks SET sprint_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE sprint_id = ? AND {UNFINISHED}"#
    ))
    .bind(dest)
    .bind(sprint_id)
    .execute(&mut *tx)
    .await
    .map_err(e)?;

    sqlx::query("UPDATE sprints SET status = 'completed' WHERE id = ?")
        .bind(sprint_id)
        .execute(&mut *tx)
        .await
        .map_err(e)?;
    tx.commit().await.map_err(e)?;
    get_sprint_inner(pool, sprint_id).await
}

/// A legacy Story leaving its sprint goes back to `ready_for_development`, with
/// the `status_changed` row `update_task` would write (attributed to its
/// assignee, else the first person).
async fn reset_to_discovery(
    tx: &mut Transaction<'_, Sqlite>,
    id: i64,
    old_status: &str,
    assignee: Option<i64>,
) -> Result<(), String> {
    let actor: i64 = match assignee {
        Some(a) => a,
        None => sqlx::query_scalar("SELECT id FROM people ORDER BY id ASC LIMIT 1")
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| e.to_string())?
            .ok_or("Add at least one person before changing task status")?,
    };
    sqlx::query("UPDATE tasks SET status = 'ready_for_development' WHERE id = ?")
        .bind(id)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query(
        r#"INSERT INTO activity_log (task_id, person_id, action, old_value, new_value, created_at)
           VALUES (?, ?, 'status_changed', ?, 'ready_for_development', strftime('%Y-%m-%dT%H:%M:%fZ','now'))"#,
    )
    .bind(id)
    .bind(actor)
    .bind(old_status)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn complete_sprint(
    pool: State<'_, SqlitePool>,
    sprint_id: i64,
    target: CompleteTarget,
) -> Result<Sprint, String> {
    complete_sprint_inner(pool.inner(), sprint_id, target).await
}

#[cfg(test)]
mod tests {
    use super::{complete_sprint_inner, update_sprint_inner, CompleteTarget, SprintUpdate};
    use crate::factory::ops::{self, Actor, NewStory, NewSubtask};
    use crate::test_support::{
        factory_project, pool, project, sprint, task, SprintStatus as S, TaskStatus as T, TaskType as K,
    };
    use sqlx::SqlitePool;

    async fn row(pool: &SqlitePool, id: i64) -> (Option<i64>, String) {
        sqlx::query_as("SELECT sprint_id, status FROM tasks WHERE id = ?").bind(id).fetch_one(pool).await.unwrap()
    }

    async fn sprint_status(pool: &SqlitePool, id: i64) -> String {
        sqlx::query_scalar("SELECT status FROM sprints WHERE id = ?").bind(id).fetch_one(pool).await.unwrap()
    }

    /// Everything a refused completion must leave as it was.
    #[derive(Debug, PartialEq)]
    struct Snapshot {
        sprints: Vec<(i64, String)>,
        tasks: Vec<(i64, Option<i64>, String, String)>,
        activity: i64,
    }

    async fn snapshot(pool: &SqlitePool) -> Snapshot {
        Snapshot {
            sprints: sqlx::query_as("SELECT id, status FROM sprints ORDER BY id").fetch_all(pool).await.unwrap(),
            tasks: sqlx::query_as("SELECT id, sprint_id, status, updated_at FROM tasks ORDER BY id")
                .fetch_all(pool)
                .await
                .unwrap(),
            activity: sqlx::query_scalar("SELECT COUNT(*) FROM activity_log").fetch_one(pool).await.unwrap(),
        }
    }

    fn to(id: i64) -> CompleteTarget {
        CompleteTarget::Sprint { sprint_id: id }
    }

    #[test]
    fn the_target_deserializes_from_the_three_json_shapes() {
        let t: CompleteTarget = serde_json::from_str(r#"{"kind":"sprint","sprintId":7}"#).unwrap();
        assert!(matches!(t, CompleteTarget::Sprint { sprint_id: 7 }));
        let t: CompleteTarget = serde_json::from_str(r#"{"kind":"backlog"}"#).unwrap();
        assert!(matches!(t, CompleteTarget::Backlog));
        let t: CompleteTarget =
            serde_json::from_str(r#"{"kind":"new","name":"S2","startDate":"2026-11-01","endDate":"2026-11-14"}"#).unwrap();
        match t {
            CompleteTarget::New { name, start_date, end_date } => {
                assert_eq!((name.as_str(), start_date.as_str(), end_date.as_str()), ("S2", "2026-11-01", "2026-11-14"));
            }
            other => panic!("{other:?}"),
        }
    }

    #[tokio::test]
    async fn unfinished_issues_carry_over_with_their_status() {
        let pool = pool().await;
        let p = project(&pool, "LG").await;
        let a = sprint(&pool, p, "S1", "2026-10-01", S::Active).await;
        let b = sprint(&pool, p, "S2", "2026-10-15", S::Backlog).await;
        let story = task(&pool, p, Some(a), None, K::Story, T::InReview).await;
        let open_child = task(&pool, p, Some(a), Some(story), K::Subtask, T::InProgress).await;
        let done_child = task(&pool, p, Some(a), Some(story), K::Subtask, T::Done).await;
        let open_task = task(&pool, p, Some(a), None, K::Subtask, T::Todo).await;
        let open_bug = task(&pool, p, Some(a), None, K::Bug, T::InProgress).await;
        let done_story = task(&pool, p, Some(a), None, K::Story, T::Done).await;
        let done_story_child = task(&pool, p, Some(a), Some(done_story), K::Subtask, T::Done).await;
        let canceled_task = task(&pool, p, Some(a), None, K::Subtask, T::Canceled).await;

        let s = complete_sprint_inner(&pool, a, to(b)).await.unwrap();
        assert_eq!(s.status, "completed");
        assert_eq!(sprint_status(&pool, b).await, "backlog", "the destination keeps its status");

        assert_eq!(row(&pool, story).await, (Some(b), "in_review".into()));
        assert_eq!(row(&pool, open_child).await, (Some(b), "in_progress".into()));
        assert_eq!(row(&pool, open_task).await, (Some(b), "todo".into()));
        assert_eq!(row(&pool, open_bug).await, (Some(b), "in_progress".into()));
        // A legacy Story's children follow it whatever their own status.
        assert_eq!(row(&pool, done_child).await, (Some(b), "done".into()));
        assert_eq!(row(&pool, done_story).await, (Some(a), "done".into()));
        assert_eq!(row(&pool, done_story_child).await, (Some(a), "done".into()));
        assert_eq!(row(&pool, canceled_task).await, (Some(a), "canceled".into()));
        let left: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE sprint_id = ? AND status NOT IN ('done','canceled')")
            .bind(a)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(left, 0);
        let touched: String = sqlx::query_scalar("SELECT updated_at FROM tasks WHERE id = ?")
            .bind(open_task)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_ne!(touched, "2026-01-01T00:00:00.000Z", "a moved task's updated_at is bumped");
    }

    #[tokio::test]
    async fn a_tested_factory_story_and_its_subtasks_carry_over_at_tested() {
        carry_over_a_tested_factory_story(false).await;
    }

    #[tokio::test]
    async fn a_tested_factory_bug_story_and_its_subtasks_carry_over_like_a_story() {
        carry_over_a_tested_factory_story(true).await;
    }

    /// A tested Story (a bug Story when `bug`) with two done Subtasks, carried
    /// from S1 to S2: all three land in S2 with their status.
    async fn carry_over_a_tested_factory_story(bug: bool) {
        let pool = pool().await;
        let p = factory_project(&pool, "SF").await;
        let a = sprint(&pool, p, "S1", "2026-10-01", S::Active).await;
        let b = sprint(&pool, p, "S2", "2026-10-15", S::Active).await;
        let key = ops::story_create(&pool, NewStory { project: "SF", title: "s", description: "", priority: "medium", labels: "", bug }, Actor::Owner)
            .await
            .unwrap()["key"]
            .as_str()
            .unwrap()
            .to_string();
        ops::story_move(&pool, &key, "refining", Actor::Owner).await.unwrap();
        for _ in 0..2 {
            ops::subtask_create(&pool, NewSubtask { story: &key, title: "x", description: "", bug: false, story_points: 2, risk: false }, Actor::Agent)
                .await
                .unwrap();
        }
        ops::story_move(&pool, &key, "ready", Actor::Owner).await.unwrap();
        ops::story_set_sprint(&pool, &key, Some(a)).await.unwrap();
        sqlx::query("UPDATE tasks SET status = 'done' WHERE parent_id IS NOT NULL").execute(&pool).await.unwrap();
        sqlx::query("UPDATE tasks SET status = 'tested' WHERE parent_id IS NULL").execute(&pool).await.unwrap();

        complete_sprint_inner(&pool, a, to(b)).await.unwrap();
        let rows: Vec<(Option<i64>, String, Option<i64>)> =
            sqlx::query_as("SELECT sprint_id, status, parent_id FROM tasks ORDER BY id").fetch_all(&pool).await.unwrap();
        assert_eq!(rows.len(), 3);
        for (sprint_id, status, parent) in rows {
            assert_eq!(sprint_id, Some(b));
            assert_eq!(status, if parent.is_none() { "tested" } else { "done" });
        }
        assert_eq!(sprint_status(&pool, b).await, "active");
    }

    #[tokio::test]
    async fn backlog_resets_legacy_stories_and_keeps_bug_statuses() {
        let pool = pool().await;
        let p = project(&pool, "LG").await;
        let a = sprint(&pool, p, "S1", "2026-10-01", S::Active).await;
        let story = task(&pool, p, Some(a), None, K::Story, T::InProgress).await;
        let child = task(&pool, p, Some(a), Some(story), K::Subtask, T::Todo).await;
        let bug = task(&pool, p, Some(a), None, K::Bug, T::InReview).await;

        complete_sprint_inner(&pool, a, CompleteTarget::Backlog).await.unwrap();
        assert_eq!(row(&pool, story).await, (None, "ready_for_development".into()));
        assert_eq!(row(&pool, child).await, (None, "todo".into()));
        assert_eq!(row(&pool, bug).await, (None, "in_review".into()));
        let log: (i64, String, String, String) = sqlx::query_as(
            "SELECT person_id, action, old_value, new_value FROM activity_log WHERE task_id = ?",
        )
        .bind(story)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(log, (1, "status_changed".into(), "in_progress".into(), "ready_for_development".into()));
        let bug_logs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM activity_log WHERE task_id = ?")
            .bind(bug)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(bug_logs, 0);
    }

    #[tokio::test]
    async fn backlog_leaves_a_ready_for_development_legacy_story_unlogged() {
        let pool = pool().await;
        let p = project(&pool, "LG").await;
        let a = sprint(&pool, p, "S1", "2026-10-01", S::Active).await;
        let story = task(&pool, p, Some(a), None, K::Story, T::ReadyForDevelopment).await;

        complete_sprint_inner(&pool, a, CompleteTarget::Backlog).await.unwrap();
        assert_eq!(row(&pool, story).await, (None, "ready_for_development".into()));
        let logs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM activity_log").fetch_one(&pool).await.unwrap();
        assert_eq!(logs, 0, "no status change, no status_changed row");
    }

    #[tokio::test]
    async fn backlog_takes_ready_factory_stories_and_their_subtasks_out() {
        let pool = pool().await;
        let p = factory_project(&pool, "SF").await;
        let a = sprint(&pool, p, "S1", "2026-10-01", S::Active).await;
        let key = ops::story_create(&pool, NewStory { project: "SF", title: "s", description: "", priority: "medium", labels: "", bug: false }, Actor::Owner)
            .await
            .unwrap()["key"]
            .as_str()
            .unwrap()
            .to_string();
        ops::story_move(&pool, &key, "refining", Actor::Owner).await.unwrap();
        ops::subtask_create(&pool, NewSubtask { story: &key, title: "x", description: "", bug: false, story_points: 1, risk: false }, Actor::Agent)
            .await
            .unwrap();
        ops::story_move(&pool, &key, "ready", Actor::Owner).await.unwrap();
        ops::story_set_sprint(&pool, &key, Some(a)).await.unwrap();
        let before: Vec<(i64, String)> =
            sqlx::query_as("SELECT id, status FROM tasks ORDER BY id").fetch_all(&pool).await.unwrap();

        complete_sprint_inner(&pool, a, CompleteTarget::Backlog).await.unwrap();
        assert_eq!(sprint_status(&pool, a).await, "completed");
        let after: Vec<(i64, Option<i64>, String)> =
            sqlx::query_as("SELECT id, sprint_id, status FROM tasks ORDER BY id").fetch_all(&pool).await.unwrap();
        assert_eq!(after.len(), 2);
        for ((id, sprint_id, status), (bid, bstatus)) in after.into_iter().zip(before) {
            assert_eq!((id, sprint_id, status), (bid, None, bstatus));
        }
    }

    #[tokio::test]
    async fn backlog_is_refused_on_a_factory_project_with_a_story_past_ready() {
        let pool = pool().await;
        let p = factory_project(&pool, "SF").await;
        let a = sprint(&pool, p, "S1", "2026-10-01", S::Active).await;
        for title in ["ready one", "building one"] {
            let key = ops::story_create(&pool, NewStory { project: "SF", title, description: "", priority: "medium", labels: "", bug: false }, Actor::Owner)
                .await
                .unwrap()["key"]
                .as_str()
                .unwrap()
                .to_string();
            ops::story_move(&pool, &key, "refining", Actor::Owner).await.unwrap();
            ops::subtask_create(&pool, NewSubtask { story: &key, title: "x", description: "", bug: false, story_points: 1, risk: false }, Actor::Agent)
                .await
                .unwrap();
            ops::story_move(&pool, &key, "ready", Actor::Owner).await.unwrap();
            ops::story_set_sprint(&pool, &key, Some(a)).await.unwrap();
            if title == "building one" {
                ops::story_move(&pool, &key, "building", Actor::Owner).await.unwrap();
            }
        }
        let before = snapshot(&pool).await;
        let err = complete_sprint_inner(&pool, a, CompleteTarget::Backlog).await.unwrap_err();
        assert!(err.contains("only at ready") && err.contains("building"), "{err}");
        assert_eq!(snapshot(&pool).await, before);
    }

    #[tokio::test]
    async fn a_new_sprint_target_creates_one_sprint_and_a_refusal_creates_none() {
        let pool = pool().await;
        let p = project(&pool, "LG").await;
        let a = sprint(&pool, p, "S1", "2026-10-01", S::Active).await;
        let open = task(&pool, p, Some(a), None, K::Subtask, T::InProgress).await;
        let new = || CompleteTarget::New { name: "S2".into(), start_date: "2026-10-15".into(), end_date: "2026-10-28".into() };

        // Refused (a done Story with an open Subtask): no stray sprint.
        let done = task(&pool, p, Some(a), None, K::Story, T::Done).await;
        let child = task(&pool, p, Some(a), Some(done), K::Subtask, T::Todo).await;
        let before = snapshot(&pool).await;
        complete_sprint_inner(&pool, a, new()).await.unwrap_err();
        assert_eq!(snapshot(&pool).await, before);

        sqlx::query("UPDATE tasks SET status = 'done' WHERE id = ?").bind(child).execute(&pool).await.unwrap();
        complete_sprint_inner(&pool, a, new()).await.unwrap();
        let created: Vec<(i64, String, String, String, String)> =
            sqlx::query_as("SELECT id, name, start_date, end_date, status FROM sprints WHERE id <> ?")
                .bind(a)
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(created.len(), 1);
        let (id, name, start, end, status) = &created[0];
        assert_eq!((name.as_str(), start.as_str(), end.as_str(), status.as_str()), ("S2", "2026-10-15", "2026-10-28", "backlog"));
        assert_eq!(row(&pool, open).await, (Some(*id), "in_progress".into()));
    }

    #[tokio::test]
    async fn a_done_story_with_an_open_subtask_refuses_completion_and_names_both() {
        let pool = pool().await;
        let p = project(&pool, "LG").await;
        let a = sprint(&pool, p, "S1", "2026-10-01", S::Active).await;
        let b = sprint(&pool, p, "S2", "2026-10-15", S::Backlog).await;
        task(&pool, p, Some(a), None, K::Subtask, T::Todo).await; // LG-1
        let done = task(&pool, p, Some(a), None, K::Story, T::Done).await; // LG-2
        task(&pool, p, Some(a), Some(done), K::Subtask, T::Done).await; // LG-3
        task(&pool, p, Some(a), Some(done), K::Subtask, T::InProgress).await; // LG-4

        let before = snapshot(&pool).await;
        let err = complete_sprint_inner(&pool, a, to(b)).await.unwrap_err();
        assert!(err.contains("LG-2") && err.contains("LG-4") && !err.contains("LG-3"), "{err}");
        assert_eq!(snapshot(&pool).await, before);
    }

    #[tokio::test]
    async fn a_done_factory_story_or_bug_story_with_an_open_subtask_refuses_completion() {
        for kind in [K::Story, K::Bug] {
            let pool = pool().await;
            let p = factory_project(&pool, "SF").await;
            let a = sprint(&pool, p, "S1", "2026-10-01", S::Active).await;
            let b = sprint(&pool, p, "S2", "2026-10-15", S::Backlog).await;
            let done = task(&pool, p, Some(a), None, kind, T::Done).await; // SF-1
            task(&pool, p, Some(a), Some(done), K::Subtask, T::Done).await; // SF-2
            task(&pool, p, Some(a), Some(done), K::Bug, T::Building).await; // SF-3

            let before = snapshot(&pool).await;
            let err = complete_sprint_inner(&pool, a, to(b)).await.unwrap_err();
            assert!(
                err.contains("SF-1 is done but has open Subtasks (SF-3)") && !err.contains("SF-2"),
                "{kind:?}: {err}"
            );
            assert_eq!(snapshot(&pool).await, before, "{kind:?}");
        }
    }

    #[tokio::test]
    async fn a_done_legacy_top_level_bug_with_an_open_child_does_not_refuse_completion() {
        let pool = pool().await;
        let p = project(&pool, "LG").await;
        let a = sprint(&pool, p, "S1", "2026-10-01", S::Active).await;
        let b = sprint(&pool, p, "S2", "2026-10-15", S::Backlog).await;
        let bug = task(&pool, p, Some(a), None, K::Bug, T::Done).await;
        let child = task(&pool, p, Some(a), Some(bug), K::Subtask, T::InProgress).await;

        complete_sprint_inner(&pool, a, to(b)).await.unwrap();
        assert_eq!(row(&pool, bug).await, (Some(a), "done".into()));
        assert_eq!(row(&pool, child).await, (Some(b), "in_progress".into()));
    }

    #[tokio::test]
    async fn bad_sources_and_targets_are_refused_and_change_nothing() {
        let pool = pool().await;
        let p = project(&pool, "LG").await;
        let other = project(&pool, "OT").await;
        let active = sprint(&pool, p, "S1", "2026-10-01", S::Active).await;
        let planned = sprint(&pool, p, "S2", "2026-10-15", S::Backlog).await;
        let done = sprint(&pool, p, "S0", "2026-09-01", S::Completed).await;
        let foreign = sprint(&pool, other, "X1", "2026-10-15", S::Backlog).await;
        task(&pool, p, Some(active), None, K::Subtask, T::Todo).await;
        task(&pool, p, Some(planned), None, K::Subtask, T::Todo).await;

        let before = snapshot(&pool).await;
        let cases = [
            (planned, to(active), "only an active sprint"),
            (done, to(planned), "only an active sprint"),
            (active, to(done), "already completed"),
            (active, to(active), "into itself"),
            (active, to(foreign), "another project"),
        ];
        for (source, target, expect) in cases {
            let err = complete_sprint_inner(&pool, source, target).await.unwrap_err();
            assert!(err.contains(expect), "{expect}: {err}");
            assert_eq!(snapshot(&pool).await, before);
        }
    }

    fn status_update(status: Option<&str>, name: Option<&str>) -> SprintUpdate {
        SprintUpdate { name: name.map(Into::into), goal: None, start_date: None, end_date: None, status: status.map(Into::into) }
    }

    #[tokio::test]
    async fn update_sprint_cannot_complete_a_sprint_but_edits_a_completed_one() {
        let pool = pool().await;
        let p = project(&pool, "LG").await;
        for from in [S::Active, S::Backlog] {
            let id = sprint(&pool, p, from.as_str(), "2026-10-01", from).await;
            let err = update_sprint_inner(&pool, id, status_update(Some("completed"), None)).await.unwrap_err();
            assert!(err.contains("Complete sprint"), "{err}");
            assert_eq!(sprint_status(&pool, id).await, from.as_str());
        }
        let done = sprint(&pool, p, "S0", "2026-09-01", S::Completed).await;
        let s = update_sprint_inner(&pool, done, status_update(Some("completed"), Some("renamed"))).await.unwrap();
        assert_eq!((s.name.as_str(), s.status.as_str()), ("renamed", "completed"));
    }
}
