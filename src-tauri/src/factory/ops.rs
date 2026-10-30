//! Domain operations on Factory projects. The CLI and the MCP both call these;
//! each one enforces the ladder, applies the assignee rule and writes its Run
//! trail event in the same transaction as the change it records.
//!
//! Run trail events live on the Story's `activity_log` (a Subtask's events too,
//! naming the Subtask in the JSON `new_value`).

use super::ladder::{self, Owner, StoryFacts};
use serde_json::{json, Value};
use sqlx::{FromRow, Sqlite, SqlitePool, Transaction};

type Tx<'a> = Transaction<'a, Sqlite>;

/// Who an event is attributed to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Actor {
    Owner,
    Agent,
}

impl Actor {
    fn role(self) -> &'static str {
        match self {
            Actor::Owner => "owner",
            Actor::Agent => "agent",
        }
    }
}

fn err(e: sqlx::Error) -> String {
    e.to_string()
}

#[derive(Debug, Clone, FromRow)]
struct Row {
    id: i64,
    project_id: i64,
    task_number: i64,
    parent_id: Option<i64>,
    sprint_id: Option<i64>,
    title: String,
    description: String,
    #[sqlx(rename = "type")]
    kind: String,
    status: String,
    priority: String,
    assignee_id: Option<i64>,
    story_points: i64,
    labels: String,
    feature_branch: Option<String>,
    review_verdict: Option<String>,
    reviewed_commit: Option<String>,
    findings_url: Option<String>,
    run_stopped: i64,
    risk: i64,
    release_id: Option<i64>,
    epic_id: Option<i64>,
    project_key: String,
    ladder: String,
    project_kind: String,
}

impl Row {
    fn key(&self) -> String {
        format!("{}-{}", self.project_key, self.task_number)
    }
}

const ROW_SQL: &str = r#"SELECT t.id, t.project_id, t.task_number, t.parent_id, t.sprint_id,
       t.title, t.description, t.type, t.status, t.priority, t.assignee_id,
       t.story_points, t.labels, t.feature_branch, t.review_verdict,
       t.reviewed_commit, t.findings_url, t.run_stopped, t.risk, t.release_id,
       t.epic_id, p.key AS project_key, p.ladder, p.kind AS project_kind
  FROM tasks t JOIN projects p ON p.id = t.project_id"#;

fn parse_key(key: &str) -> Result<(String, i64), String> {
    let (project, n) = key
        .rsplit_once('-')
        .ok_or_else(|| format!("'{key}' is not an issue key like SF-2"))?;
    let n = n
        .parse::<i64>()
        .map_err(|_| format!("'{key}' is not an issue key like SF-2"))?;
    Ok((project.to_uppercase(), n))
}

async fn load(tx: &mut Tx<'_>, key: &str) -> Result<Row, String> {
    let (project, n) = parse_key(key)?;
    sqlx::query_as::<_, Row>(&format!("{ROW_SQL} WHERE p.key = ? AND t.task_number = ?"))
        .bind(&project)
        .bind(n)
        .fetch_optional(&mut **tx)
        .await
        .map_err(err)?
        .ok_or_else(|| format!("{key} not found"))
}

async fn load_by_id(tx: &mut Tx<'_>, id: i64) -> Result<Row, String> {
    sqlx::query_as::<_, Row>(&format!("{ROW_SQL} WHERE t.id = ?"))
        .bind(id)
        .fetch_one(&mut **tx)
        .await
        .map_err(err)
}

fn require_factory(row: &Row) -> Result<(), String> {
    if row.ladder != "factory" {
        return Err(format!(
            "{} belongs to a legacy project; the Factory does not write to it",
            row.key()
        ));
    }
    Ok(())
}

/// The one rule for "is a Story" (FB-52): on a Factory project, a top-level
/// `story` (a feature) or a top-level `bug` (a fix) climbs the Story ladder. A
/// `bug` with a parent is a bug Subtask. The caller checks the ladder: on a
/// legacy project a top-level bug is just a bug.
fn is_story_level(kind: &str, parent_id: Option<i64>) -> bool {
    parent_id.is_none() && matches!(kind, "story" | "bug")
}

/// [`is_story_level`] as a SQL condition on the `tasks` row aliased `t`.
pub(crate) fn story_level_sql(t: &str) -> String {
    format!("({t}.parent_id IS NULL AND {t}.type IN ('story','bug'))")
}

/// An epic (FB-224): a top-level `epic`. It groups Stories by goal and is never
/// built, so it climbs no Story ladder; its own lifecycle is
/// [`ladder::check_epic_move`].
fn is_epic(kind: &str, parent_id: Option<i64>) -> bool {
    parent_id.is_none() && kind == "epic"
}

/// A Factory epic: an [`is_epic`] row on a Factory project.
async fn load_epic(tx: &mut Tx<'_>, key: &str) -> Result<Row, String> {
    let row = load(tx, key).await?;
    require_factory(&row)?;
    if !is_epic(&row.kind, row.parent_id) {
        return Err(format!("{key} is not an epic"));
    }
    Ok(row)
}

/// A Factory Story: a Story-level row on a Factory project.
async fn load_story(tx: &mut Tx<'_>, key: &str) -> Result<Row, String> {
    let row = load(tx, key).await?;
    require_factory(&row)?;
    if !is_story_level(&row.kind, row.parent_id) {
        return Err(format!("{key} is not a Story"));
    }
    Ok(row)
}

/// A Factory Subtask: a `subtask` or `bug` row whose parent is a Story.
async fn load_subtask(tx: &mut Tx<'_>, key: &str) -> Result<(Row, Row), String> {
    let row = load(tx, key).await?;
    require_factory(&row)?;
    let parent = match row.parent_id {
        Some(p) if matches!(row.kind.as_str(), "subtask" | "bug") => load_by_id(tx, p).await?,
        _ => return Err(format!("{key} is not a Subtask")),
    };
    if !is_story_level(&parent.kind, parent.parent_id) {
        return Err(format!("{key} is not a Subtask of a Story"));
    }
    Ok((row, parent))
}

async fn role_person(tx: &mut Tx<'_>, role: &str) -> Result<i64, String> {
    sqlx::query_scalar::<_, i64>("SELECT id FROM people WHERE factory_role = ?")
        .bind(role)
        .fetch_optional(&mut **tx)
        .await
        .map_err(err)?
        .ok_or_else(|| {
            format!("no person has factory_role '{role}'; run `flowboard-cli people set-role <person id> {role}`")
        })
}

async fn primary_contact(tx: &mut Tx<'_>, project_id: i64) -> Result<i64, String> {
    sqlx::query_scalar::<_, i64>(
        "SELECT person_id FROM project_contacts WHERE project_id = ? AND is_primary = 1",
    )
    .bind(project_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(err)?
    .ok_or_else(|| "the project has no primary client contact; run `flowboard-cli contact add <project> <person id> --primary`".into())
}

async fn log(
    tx: &mut Tx<'_>,
    task_id: i64,
    actor: Actor,
    action: &str,
    old_value: &str,
    new_value: &str,
) -> Result<(), String> {
    let person = role_person(tx, actor.role()).await?;
    sqlx::query(
        r#"INSERT INTO activity_log (task_id, person_id, action, old_value, new_value, created_at)
           VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))"#,
    )
    .bind(task_id)
    .bind(person)
    .bind(action)
    .bind(old_value)
    .bind(new_value)
    .execute(&mut **tx)
    .await
    .map_err(err)?;
    Ok(())
}

async fn count_events(tx: &mut Tx<'_>, story_id: i64, action: &str, subtask: Option<&str>) -> Result<i64, String> {
    sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM activity_log
            WHERE task_id = ? AND action = ?
              AND (? IS NULL OR json_extract(new_value, '$.subtask') = ?)"#,
    )
    .bind(story_id)
    .bind(action)
    .bind(subtask)
    .bind(subtask)
    .fetch_one(&mut **tx)
    .await
    .map_err(err)
}

/// A Story's points are the sum of its Subtasks' (SF-68). Bug Subtasks and
/// canceled ones don't count, so the total stays the refined estimate.
async fn sync_points(tx: &mut Tx<'_>, story_id: i64) -> Result<(), String> {
    sqlx::query(
        r#"UPDATE tasks SET story_points = (
              SELECT COALESCE(SUM(story_points), 0) FROM tasks
               WHERE parent_id = ? AND type <> 'bug' AND status <> 'canceled')
            WHERE id = ?"#,
    )
    .bind(story_id)
    .bind(story_id)
    .execute(&mut **tx)
    .await
    .map_err(err)?;
    Ok(())
}

async fn touch(tx: &mut Tx<'_>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE tasks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
        .bind(id)
        .execute(&mut **tx)
        .await
        .map_err(err)?;
    Ok(())
}

fn require_building(story: &Row, what: &str) -> Result<(), String> {
    if story.status != "building" {
        return Err(format!(
            "{what} happens while the Story is building; {} is {}",
            story.key(),
            story.status
        ));
    }
    Ok(())
}

async fn open_subtasks(tx: &mut Tx<'_>, story_id: i64, only_bugs: bool) -> Result<i64, String> {
    sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM tasks
            WHERE parent_id = ? AND status NOT IN ('done','canceled')
              AND (? = 0 OR type = 'bug')"#,
    )
    .bind(story_id)
    .bind(only_bugs)
    .fetch_one(&mut **tx)
    .await
    .map_err(err)
}

// ─── Read ───────────────────────────────────────────────────────────────────

async fn story_json(tx: &mut Tx<'_>, story: &Row) -> Result<Value, String> {
    let subtasks = sqlx::query_as::<_, Row>(&format!(
        "{ROW_SQL} WHERE t.parent_id = ? ORDER BY t.task_number"
    ))
    .bind(story.id)
    .fetch_all(&mut **tx)
    .await
    .map_err(err)?;
    let prs: Vec<(String, String, String)> =
        sqlx::query_as("SELECT url, target, state FROM task_prs WHERE task_id = ? ORDER BY id")
            .bind(story.id)
            .fetch_all(&mut **tx)
            .await
            .map_err(err)?;
    let depends_on: Vec<String> = sqlx::query_scalar(
        r#"SELECT p.key || '-' || t.task_number FROM task_links l
             JOIN tasks t ON t.id = l.depends_on_id JOIN projects p ON p.id = t.project_id
            WHERE l.task_id = ? ORDER BY t.task_number"#,
    )
    .bind(story.id)
    .fetch_all(&mut **tx)
    .await
    .map_err(err)?;
    let assignee: Option<String> = match story.assignee_id {
        Some(id) => sqlx::query_scalar("SELECT name FROM people WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(err)?,
        None => None,
    };
    let release: Option<(String, String)> = match story.release_id {
        Some(id) => sqlx::query_as("SELECT version, state FROM releases WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(err)?,
        None => None,
    };
    let epic: Option<(String, String, String)> = match story.epic_id {
        Some(id) => sqlx::query_as(
            r#"SELECT p.key || '-' || t.task_number, t.title, t.status FROM tasks t
                 JOIN projects p ON p.id = t.project_id WHERE t.id = ?"#,
        )
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(err)?,
        None => None,
    };
    let waiting_on_bugs = open_subtasks(tx, story.id, true).await?;
    Ok(json!({
        "key": story.key(),
        "title": story.title,
        "type": story.kind,
        "status": story.status,
        "priority": story.priority,
        "labels": story.labels,
        "assignee": assignee,
        "sprint_id": story.sprint_id,
        "feature_branch": story.feature_branch,
        "review": {
            "verdict": story.review_verdict,
            "commit": story.reviewed_commit,
            "findings_url": story.findings_url,
        },
        "release": release.map(|(version, state)| json!({ "version": version, "state": state })),
        "epic": epic.map(|(key, title, status)| json!({ "key": key, "title": title, "status": status })),
        "flags": { "stopped": story.run_stopped != 0, "waiting_on_bugs": waiting_on_bugs },
        "prs": prs.into_iter().map(|(url, target, state)| json!({ "url": url, "target": target, "state": state })).collect::<Vec<_>>(),
        "depends_on": depends_on,
        "subtasks": subtasks.iter().map(|s| json!({
            "key": s.key(),
            "title": s.title,
            "type": s.kind,
            "status": s.status,
            "story_points": s.story_points,
            "risk": s.risk != 0,
        })).collect::<Vec<_>>(),
        "description": story.description,
    }))
}

pub async fn story_show(pool: &SqlitePool, key: &str) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    story_json(&mut tx, &story).await
}

pub async fn trail(pool: &SqlitePool, key: &str) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    let rows: Vec<(String, String, String, String, String)> = sqlx::query_as(
        r#"SELECT a.created_at, a.action, a.old_value, a.new_value, p.name
             FROM activity_log a JOIN people p ON p.id = a.person_id
            WHERE a.task_id = ? ORDER BY a.id"#,
    )
    .bind(story.id)
    .fetch_all(&mut *tx)
    .await
    .map_err(err)?;
    Ok(Value::Array(
        rows.into_iter()
            .map(|(at, action, old, new, by)| {
                let new = serde_json::from_str::<Value>(&new)
                    .ok()
                    .filter(Value::is_object)
                    .unwrap_or(Value::String(new));
                json!({ "at": at, "action": action, "old": old, "new": new, "by": by })
            })
            .collect(),
    ))
}

/// Every Factory Story with a Run under way, across projects: `ready` in a
/// sprint through `user_testing`. Stopped Runs first, then the longest in
/// their Stage.
pub async fn active_runs(pool: &SqlitePool) -> Result<Value, String> {
    #[derive(FromRow)]
    struct Active {
        key: String,
        project: String,
        title: String,
        status: String,
        assignee: Option<String>,
        assignee_role: Option<String>,
        run_stopped: i64,
        waiting_on_bugs: i64,
        stage_entered_at: String,
    }
    let rows = sqlx::query_as::<_, Active>(&format!(
        r#"SELECT p.key || '-' || t.task_number AS key, p.name AS project, t.title, t.status,
                  a.name AS assignee, a.factory_role AS assignee_role, t.run_stopped,
                  (SELECT COUNT(*) FROM tasks b WHERE b.parent_id = t.id AND b.type = 'bug'
                      AND b.status NOT IN ('done','canceled')) AS waiting_on_bugs,
                  COALESCE((SELECT MAX(l.created_at) FROM activity_log l
                             WHERE l.task_id = t.id AND l.action = 'stage_entered'),
                           t.created_at) AS stage_entered_at
             FROM tasks t
             JOIN projects p ON p.id = t.project_id
             LEFT JOIN people a ON a.id = t.assignee_id
            WHERE p.ladder = 'factory' AND {}
              AND t.sprint_id IS NOT NULL
              AND t.status IN ('ready','building','integrated_tests','tested','user_testing')
            ORDER BY t.run_stopped DESC, stage_entered_at, p.key, t.task_number"#,
        story_level_sql("t"),
    ))
    .fetch_all(pool)
    .await
    .map_err(err)?;
    Ok(Value::Array(
        rows.into_iter()
            .map(|r| {
                json!({
                    "key": r.key,
                    "project": r.project,
                    "title": r.title,
                    "status": r.status,
                    "assignee": r.assignee,
                    "needs_pedro": r.assignee_role.as_deref() == Some("owner"),
                    "flags": { "stopped": r.run_stopped != 0, "waiting_on_bugs": r.waiting_on_bugs },
                    "stage_entered_at": r.stage_entered_at,
                })
            })
            .collect(),
    ))
}

// ─── People, projects, contacts ─────────────────────────────────────────────

pub async fn people_set_role(pool: &SqlitePool, person_id: i64, role: Option<&str>) -> Result<Value, String> {
    if let Some(r) = role {
        if !matches!(r, "owner" | "agent") {
            return Err(format!("'{r}' is not a factory role (owner, agent)"));
        }
    }
    let mut tx = pool.begin().await.map_err(err)?;
    // Hand the role over: whoever held it before loses it.
    if let Some(r) = role {
        sqlx::query("UPDATE people SET factory_role = NULL WHERE factory_role = ?")
            .bind(r)
            .execute(&mut *tx)
            .await
            .map_err(err)?;
    }
    let updated = sqlx::query("UPDATE people SET factory_role = ? WHERE id = ?")
        .bind(role)
        .bind(person_id)
        .execute(&mut *tx)
        .await
        .map_err(err)?
        .rows_affected();
    if updated == 0 {
        return Err(format!("person {person_id} not found"));
    }
    tx.commit().await.map_err(err)?;
    people_list(pool).await
}

pub async fn people_list(pool: &SqlitePool) -> Result<Value, String> {
    let rows: Vec<(i64, String, Option<String>)> =
        sqlx::query_as("SELECT id, name, factory_role FROM people ORDER BY id")
            .fetch_all(pool)
            .await
            .map_err(err)?;
    Ok(Value::Array(
        rows.into_iter()
            .map(|(id, name, role)| json!({ "id": id, "name": name, "factory_role": role }))
            .collect(),
    ))
}

async fn project_id(tx: &mut Tx<'_>, key: &str) -> Result<(i64, String, String), String> {
    sqlx::query_as("SELECT id, ladder, kind FROM projects WHERE key = ?")
        .bind(key.to_uppercase())
        .fetch_optional(&mut **tx)
        .await
        .map_err(err)?
        .ok_or_else(|| format!("project {key} not found"))
}

pub async fn project_show(pool: &SqlitePool, key: &str) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let (id, ladder, kind) = project_id(&mut tx, key).await?;
    let contacts: Vec<(i64, String, i64)> = sqlx::query_as(
        r#"SELECT p.id, p.name, c.is_primary FROM project_contacts c
             JOIN people p ON p.id = c.person_id WHERE c.project_id = ? ORDER BY p.id"#,
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await
    .map_err(err)?;
    Ok(json!({
        "key": key.to_uppercase(),
        "ladder": ladder,
        "kind": kind,
        "contacts": contacts.into_iter().map(|(id, name, primary)| json!({ "person_id": id, "name": name, "primary": primary != 0 })).collect::<Vec<_>>(),
    }))
}

/// Open items of a project that don't fit the Factory ladder: anything but a
/// Story-level row in a Story status, a `subtask`/`bug` under one in a
/// Subtask status, or a top-level `epic` in an epic status with no sprint and
/// no points (FB-224: the Factory guards refuse clearing either afterwards).
/// An epic of any status holding a sprint, points or a parent is unmapped too.
/// Returns their keys.
async fn unmapped_items(tx: &mut Tx<'_>, project_id: i64, key: &str) -> Result<Vec<String>, String> {
    let quoted = |statuses: &[&str]| statuses.iter().map(|s| format!("'{s}'")).collect::<Vec<_>>().join(",");
    let open = |statuses: &[&str]| quoted(&statuses.iter().copied().filter(|s| !matches!(*s, "done" | "canceled")).collect::<Vec<_>>());
    let numbers: Vec<i64> = sqlx::query_scalar(&format!(
        r#"SELECT t.task_number FROM tasks t LEFT JOIN tasks parent ON parent.id = t.parent_id
            WHERE t.project_id = ?
              AND ((t.status NOT IN ('done','canceled')
                    AND NOT ({} AND t.status IN ({}))
                    AND NOT (t.parent_id IS NOT NULL AND t.type IN ('subtask','bug') AND {}
                             AND t.status IN ({}))
                    AND NOT (t.parent_id IS NULL AND t.type = 'epic' AND t.status IN ({})
                             AND t.sprint_id IS NULL AND t.story_points = 0))
                   OR (t.type = 'epic'
                       AND (t.parent_id IS NOT NULL OR t.sprint_id IS NOT NULL OR t.story_points != 0)))
            ORDER BY t.task_number"#,
        story_level_sql("t"),
        open(ladder::STORY_STATUSES),
        story_level_sql("parent"),
        open(ladder::SUBTASK_STATUSES),
        open(ladder::EPIC_STATUSES),
    ))
    .bind(project_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(err)?;
    Ok(numbers.into_iter().map(|n| format!("{key}-{n}")).collect())
}

/// Set a project's ladder and/or kind. Switching to the Factory ladder is
/// refused while an open item isn't mapped to it yet: mapping is a Rollout
/// step, and an unmapped item would vanish from every board.
pub async fn project_set(
    pool: &SqlitePool,
    key: &str,
    ladder: Option<&str>,
    kind: Option<&str>,
) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let (id, current_ladder, _) = project_id(&mut tx, key).await?;
    if let Some(l) = ladder {
        if !matches!(l, "legacy" | "factory") {
            return Err(format!("'{l}' is not a ladder (legacy, factory)"));
        }
        if l == "factory" && current_ladder != "factory" {
            let unmapped = unmapped_items(&mut tx, id, key).await?;
            if !unmapped.is_empty() {
                return Err(format!(
                    "{key} has {} open item(s) not mapped to the Factory ladder ({}); map them before switching",
                    unmapped.len(),
                    unmapped.join(", ")
                ));
            }
        }
        sqlx::query("UPDATE projects SET ladder = ? WHERE id = ?")
            .bind(l)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(err)?;
    }
    if let Some(k) = kind {
        if !matches!(k, "internal" | "client") {
            return Err(format!("'{k}' is not a project kind (internal, client)"));
        }
        sqlx::query("UPDATE projects SET kind = ? WHERE id = ?")
            .bind(k)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(err)?;
    }
    tx.commit().await.map_err(err)?;
    project_show(pool, key).await
}

pub async fn contact_add(pool: &SqlitePool, key: &str, person_id: i64, primary: bool) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let (id, _, _) = project_id(&mut tx, key).await?;
    if primary {
        sqlx::query("UPDATE project_contacts SET is_primary = 0 WHERE project_id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(err)?;
    }
    sqlx::query(
        r#"INSERT INTO project_contacts (project_id, person_id, is_primary) VALUES (?, ?, ?)
           ON CONFLICT (project_id, person_id) DO UPDATE SET is_primary = excluded.is_primary"#,
    )
    .bind(id)
    .bind(person_id)
    .bind(primary)
    .execute(&mut *tx)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(d) if d.message().contains("FOREIGN KEY") => format!("person {person_id} not found"),
        e => e.to_string(),
    })?;
    tx.commit().await.map_err(err)?;
    project_show(pool, key).await
}

pub async fn contact_remove(pool: &SqlitePool, key: &str, person_id: i64) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let (id, _, _) = project_id(&mut tx, key).await?;
    sqlx::query("DELETE FROM project_contacts WHERE project_id = ? AND person_id = ?")
        .bind(id)
        .bind(person_id)
        .execute(&mut *tx)
        .await
        .map_err(err)?;
    tx.commit().await.map_err(err)?;
    project_show(pool, key).await
}

// ─── Stories ────────────────────────────────────────────────────────────────

pub struct NewStory<'a> {
    pub project: &'a str,
    pub title: &'a str,
    pub description: &'a str,
    pub priority: &'a str,
    pub labels: &'a str,
    /// true files a bug Story (a fix) instead of a feature Story (FB-52).
    pub bug: bool,
}

pub async fn story_create(pool: &SqlitePool, s: NewStory<'_>, actor: Actor) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let (pid, ladder, _) = project_id(&mut tx, s.project).await?;
    if ladder != "factory" {
        return Err(format!("{} is a legacy project; the Factory does not write to it", s.project));
    }
    let owner = role_person(&mut tx, "owner").await?;
    let kind = if s.bug { "bug" } else { "story" };
    let id = insert_task(&mut tx, pid, None, None, kind, "backlog", s.title, s.description, s.priority, Some(owner), 0, false, s.labels).await?;
    log(&mut tx, id, actor, "created", "", "backlog").await?;
    let story = load_by_id(&mut tx, id).await?;
    let out = story_json(&mut tx, &story).await?;
    tx.commit().await.map_err(err)?;
    Ok(out)
}

#[allow(clippy::too_many_arguments)]
async fn insert_task(
    tx: &mut Tx<'_>,
    project_id: i64,
    sprint_id: Option<i64>,
    parent_id: Option<i64>,
    kind: &str,
    status: &str,
    title: &str,
    description: &str,
    priority: &str,
    assignee_id: Option<i64>,
    story_points: i64,
    risk: bool,
    labels: &str,
) -> Result<i64, String> {
    if !matches!(priority, "low" | "medium" | "high" | "critical") {
        return Err(format!("'{priority}' is not a priority (low, medium, high, critical)"));
    }
    sqlx::query_scalar(
        r#"INSERT INTO tasks (
             project_id, task_number, sprint_id, parent_id, title, description, type, status,
             priority, assignee_id, story_points, risk, labels, created_at, updated_at)
           VALUES (?, (SELECT COALESCE(MAX(task_number), 0) + 1 FROM tasks WHERE project_id = ?),
                   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           RETURNING id"#,
    )
    .bind(project_id)
    .bind(project_id)
    .bind(sprint_id)
    .bind(parent_id)
    .bind(title)
    .bind(description)
    .bind(kind)
    .bind(status)
    .bind(priority)
    .bind(assignee_id)
    .bind(story_points)
    .bind(risk)
    .bind(labels)
    .fetch_one(&mut **tx)
    .await
    .map_err(err)
}

pub struct StoryEdit<'a> {
    pub title: Option<&'a str>,
    pub description: Option<&'a str>,
    pub priority: Option<&'a str>,
    pub labels: Option<&'a str>,
    /// The Story's epic (FB-224): `None` leaves it, `Some(None)` clears it,
    /// `Some(Some(key))` puts the Story in that epic.
    pub epic: Option<Option<&'a str>>,
}

pub async fn story_edit(pool: &SqlitePool, key: &str, e: StoryEdit<'_>) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    let priority = e.priority.unwrap_or(&story.priority);
    if !matches!(priority, "low" | "medium" | "high" | "critical") {
        return Err(format!("'{priority}' is not a priority (low, medium, high, critical)"));
    }
    let epic_id = match e.epic {
        None => story.epic_id,
        Some(epic_key) => {
            let epic = match epic_key {
                Some(k) => Some(load(&mut tx, k).await?),
                None => None,
            };
            check_epic_link(&story, epic.as_ref())?;
            epic.map(|e| e.id)
        }
    };
    sqlx::query(
        r#"UPDATE tasks SET title = ?, description = ?, priority = ?, labels = ?, epic_id = ?,
                  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"#,
    )
    .bind(e.title.unwrap_or(&story.title))
    .bind(e.description.unwrap_or(&story.description))
    .bind(priority)
    .bind(e.labels.unwrap_or(&story.labels))
    .bind(epic_id)
    .bind(story.id)
    .execute(&mut *tx)
    .await
    .map_err(err)?;
    let story = load_by_id(&mut tx, story.id).await?;
    let out = story_json(&mut tx, &story).await?;
    tx.commit().await.map_err(err)?;
    Ok(out)
}

/// Move a loaded Story inside `tx`: check the ladder, hand it to the new
/// status's owner and write the trail event.
async fn move_story(tx: &mut Tx<'_>, story: &Row, to: &str, actor: Actor) -> Result<(), String> {
    let facts = StoryFacts {
        status: &story.status,
        in_sprint: story.sprint_id.is_some(),
        client_project: story.project_kind == "client",
        open_subtasks: open_subtasks(tx, story.id, false).await?,
        run_stopped: story.run_stopped != 0,
        story_points: story.story_points,
    };
    ladder::check_story_move(&facts, to)?;
    let assignee = match ladder::story_owner(to) {
        Owner::Pedro => Some(role_person(tx, "owner").await?),
        Owner::Agent => Some(role_person(tx, "agent").await?),
        Owner::ClientContact => Some(primary_contact(tx, story.project_id).await?),
        Owner::Nobody => None,
    };
    sqlx::query(
        r#"UPDATE tasks SET status = ?, assignee_id = ?,
                  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"#,
    )
    .bind(to)
    .bind(assignee)
    .bind(story.id)
    .execute(&mut **tx)
    .await
    .map_err(err)?;
    log(tx, story.id, actor, "stage_entered", &story.status, to).await
}

pub async fn story_move(pool: &SqlitePool, key: &str, to: &str, actor: Actor) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    move_story(&mut tx, &story, to, actor).await?;
    let story = load_by_id(&mut tx, story.id).await?;
    let out = story_json(&mut tx, &story).await?;
    tx.commit().await.map_err(err)?;
    Ok(out)
}

/// Put a Story into a sprint, take it out, or carry it to another sprint. Its
/// Subtasks follow. A Story enters or leaves sprints only at `ready` (the one
/// status shown on both boards); carrying it between sprints is allowed at any
/// open status.
pub async fn story_set_sprint(pool: &SqlitePool, key: &str, sprint_id: Option<i64>) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    set_sprint(&mut tx, &story, sprint_id).await?;
    let story = load_by_id(&mut tx, story.id).await?;
    let out = story_json(&mut tx, &story).await?;
    tx.commit().await.map_err(err)?;
    Ok(out)
}

/// `story_set_sprint` for a Story the app names by id, inside the caller's
/// transaction (FB-97: `complete_sprint` carries Stories over this way, so a
/// refusal rolls back the whole completion).
pub async fn app_story_set_sprint(
    tx: &mut Transaction<'_, Sqlite>,
    story_id: i64,
    sprint_id: Option<i64>,
) -> Result<(), String> {
    let story = load_by_id(tx, story_id).await?;
    require_factory(&story)?;
    if !is_story_level(&story.kind, story.parent_id) {
        return Err(format!("{} is not a Story", story.key()));
    }
    set_sprint(tx, &story, sprint_id).await
}

/// The one copy of the sprint rule for a loaded Story, inside `tx`: the sprint
/// must be the Story's project's, and the Story enters or leaves sprints only
/// at `ready`. Its Subtasks follow.
async fn set_sprint(tx: &mut Tx<'_>, story: &Row, sprint_id: Option<i64>) -> Result<(), String> {
    if let Some(sid) = sprint_id {
        let sprint_project: Option<i64> = sqlx::query_scalar("SELECT project_id FROM sprints WHERE id = ?")
            .bind(sid)
            .fetch_optional(&mut **tx)
            .await
            .map_err(err)?;
        if sprint_project != Some(story.project_id) {
            return Err(format!("sprint {sid} does not belong to {}'s project", story.key()));
        }
    }
    match (story.sprint_id, sprint_id) {
        (a, b) if a == b => return Err("the Story is already there".into()),
        (Some(_), Some(_)) if !matches!(story.status.as_str(), "done" | "canceled") => {}
        _ if story.status == "ready" => {}
        _ => {
            return Err(format!(
                "a Story enters or leaves a sprint only at ready; {} is {}",
                story.key(),
                story.status
            ))
        }
    }
    sqlx::query(
        r#"UPDATE tasks SET sprint_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id = ? OR parent_id = ?"#,
    )
    .bind(sprint_id)
    .bind(story.id)
    .bind(story.id)
    .execute(&mut **tx)
    .await
    .map_err(err)?;
    Ok(())
}

pub async fn story_set_branch(pool: &SqlitePool, key: &str, branch: &str) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    sqlx::query(
        "UPDATE tasks SET feature_branch = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    )
    .bind(branch)
    .bind(story.id)
    .execute(&mut *tx)
    .await
    .map_err(err)?;
    let story = load_by_id(&mut tx, story.id).await?;
    let out = story_json(&mut tx, &story).await?;
    tx.commit().await.map_err(err)?;
    Ok(out)
}

/// Post a comment on a Story as the actor's person (Review findings, for one).
/// Returns the comment; `flowboard://comment/<id>` is how other fields link to it.
pub async fn story_comment(pool: &SqlitePool, key: &str, body: &str, actor: Actor) -> Result<Value, String> {
    if body.trim().is_empty() {
        return Err("a comment needs a body".into());
    }
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    let author = role_person(&mut tx, actor.role()).await?;
    let (id, created_at): (i64, String) = sqlx::query_as(
        r#"INSERT INTO comments (task_id, author_id, body, created_at)
           VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           RETURNING id, created_at"#,
    )
    .bind(story.id)
    .bind(author)
    .bind(body)
    .fetch_one(&mut *tx)
    .await
    .map_err(err)?;
    touch(&mut tx, story.id).await?;
    tx.commit().await.map_err(err)?;
    Ok(json!({
        "id": id,
        "key": story.key(),
        "author_id": author,
        "created_at": created_at,
        "url": format!("flowboard://comment/{id}"),
    }))
}

pub async fn link_add(pool: &SqlitePool, key: &str, depends_on: &str) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    let other = load_story(&mut tx, depends_on).await?;
    if other.project_id != story.project_id {
        return Err("a Story can only depend on a Story of the same project".into());
    }
    if other.id == story.id {
        return Err("a Story cannot depend on itself".into());
    }
    sqlx::query(
        r#"INSERT OR IGNORE INTO task_links (task_id, depends_on_id, created_at)
           VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))"#,
    )
    .bind(story.id)
    .bind(other.id)
    .execute(&mut *tx)
    .await
    .map_err(err)?;
    let out = story_json(&mut tx, &story).await?;
    tx.commit().await.map_err(err)?;
    Ok(out)
}

pub async fn link_remove(pool: &SqlitePool, key: &str, depends_on: &str) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    let other = load(&mut tx, depends_on).await?;
    sqlx::query("DELETE FROM task_links WHERE task_id = ? AND depends_on_id = ?")
        .bind(story.id)
        .bind(other.id)
        .execute(&mut *tx)
        .await
        .map_err(err)?;
    let out = story_json(&mut tx, &story).await?;
    tx.commit().await.map_err(err)?;
    Ok(out)
}

// ─── Run trail ──────────────────────────────────────────────────────────────

pub async fn review_record(
    pool: &SqlitePool,
    key: &str,
    verdict: &str,
    commit: &str,
    findings_url: Option<&str>,
    actor: Actor,
) -> Result<Value, String> {
    if !matches!(verdict, "passed" | "failed") {
        return Err(format!("'{verdict}' is not a Review verdict (passed, failed)"));
    }
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    require_building(&story, "Review")?;
    let round = count_events(&mut tx, story.id, "review_round", None).await? + 1;
    sqlx::query(
        r#"UPDATE tasks SET review_verdict = ?, reviewed_commit = ?, findings_url = ?,
                  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"#,
    )
    .bind(verdict)
    .bind(commit)
    .bind(findings_url)
    .bind(story.id)
    .execute(&mut *tx)
    .await
    .map_err(err)?;
    let event = json!({ "round": round, "verdict": verdict, "commit": commit, "findings_url": findings_url });
    log(&mut tx, story.id, actor, "review_round", "", &event.to_string()).await?;
    let story = load_by_id(&mut tx, story.id).await?;
    let out = story_json(&mut tx, &story).await?;
    tx.commit().await.map_err(err)?;
    Ok(out)
}

/// Mark the start of a Review round, so the Run graph can tell Review from
/// Docs before the round's verdict. Rounds are numbered like `review_record`
/// numbers them. Open Subtasks are not checked, so a manual Review still works.
pub async fn review_start(pool: &SqlitePool, key: &str, actor: Actor) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    require_building(&story, "Starting a Review")?;
    if story.run_stopped != 0 {
        return Err(format!("{}'s Run is stopped", story.key()));
    }
    let round = count_events(&mut tx, story.id, "review_round", None).await? + 1;
    log(&mut tx, story.id, actor, "review_started", "", &json!({ "round": round }).to_string()).await?;
    let out = story_json(&mut tx, &story).await?;
    tx.commit().await.map_err(err)?;
    Ok(out)
}

pub async fn run_stop(pool: &SqlitePool, key: &str, reason: &str, actor: Actor) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    require_building(&story, "Stopping a Run")?;
    if story.run_stopped != 0 {
        return Err(format!("{}'s Run is already stopped", story.key()));
    }
    let owner = role_person(&mut tx, "owner").await?;
    sqlx::query(
        r#"UPDATE tasks SET run_stopped = 1, assignee_id = ?,
                  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"#,
    )
    .bind(owner)
    .bind(story.id)
    .execute(&mut *tx)
    .await
    .map_err(err)?;
    log(&mut tx, story.id, actor, "run_stopped", "", &json!({ "reason": reason }).to_string()).await?;
    let story = load_by_id(&mut tx, story.id).await?;
    let out = story_json(&mut tx, &story).await?;
    tx.commit().await.map_err(err)?;
    Ok(out)
}

pub async fn run_restart(pool: &SqlitePool, key: &str, actor: Actor) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    if story.run_stopped == 0 {
        return Err(format!("{}'s Run is not stopped", story.key()));
    }
    let agent = role_person(&mut tx, "agent").await?;
    sqlx::query(
        r#"UPDATE tasks SET run_stopped = 0, assignee_id = ?,
                  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"#,
    )
    .bind(agent)
    .bind(story.id)
    .execute(&mut *tx)
    .await
    .map_err(err)?;
    log(&mut tx, story.id, actor, "run_restarted", "", "").await?;
    let story = load_by_id(&mut tx, story.id).await?;
    let out = story_json(&mut tx, &story).await?;
    tx.commit().await.map_err(err)?;
    Ok(out)
}

pub async fn pr_open(pool: &SqlitePool, key: &str, url: &str, target: &str, actor: Actor) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    sqlx::query(
        r#"INSERT INTO task_prs (task_id, url, target, state, created_at, updated_at)
           VALUES (?, ?, ?, 'open', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))"#,
    )
    .bind(story.id)
    .bind(url)
    .bind(target)
    .execute(&mut *tx)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(d) if d.message().contains("UNIQUE") => format!("{url} is already recorded on {key}"),
        e => e.to_string(),
    })?;
    touch(&mut tx, story.id).await?;
    log(&mut tx, story.id, actor, "pr_opened", "", &json!({ "url": url, "target": target }).to_string()).await?;
    let out = story_json(&mut tx, &story).await?;
    tx.commit().await.map_err(err)?;
    Ok(out)
}

pub async fn pr_set_state(pool: &SqlitePool, key: &str, url: &str, state: &str, actor: Actor) -> Result<Value, String> {
    if !matches!(state, "merged" | "closed") {
        return Err(format!("'{state}' is not a PR outcome (merged, closed)"));
    }
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    let updated = sqlx::query(
        r#"UPDATE task_prs SET state = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE task_id = ? AND url = ? AND state = 'open'"#,
    )
    .bind(state)
    .bind(story.id)
    .bind(url)
    .execute(&mut *tx)
    .await
    .map_err(err)?
    .rows_affected();
    if updated == 0 {
        return Err(format!("no open PR {url} on {key}"));
    }
    touch(&mut tx, story.id).await?;
    if state == "merged" {
        log(&mut tx, story.id, actor, "pr_merged", "", &json!({ "url": url }).to_string()).await?;
    }
    let out = story_json(&mut tx, &story).await?;
    tx.commit().await.map_err(err)?;
    Ok(out)
}

// ─── Subtasks ───────────────────────────────────────────────────────────────

pub struct NewSubtask<'a> {
    pub story: &'a str,
    pub title: &'a str,
    pub description: &'a str,
    pub bug: bool,
    pub story_points: i64,
    pub risk: bool,
}

pub async fn subtask_create(pool: &SqlitePool, s: NewSubtask<'_>, actor: Actor) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, s.story).await?;
    if matches!(story.status.as_str(), "done" | "canceled") {
        return Err(format!("{} is {}; it takes no new Subtasks", story.key(), story.status));
    }
    let kind = if s.bug { "bug" } else { "subtask" };
    let id = insert_task(
        &mut tx, story.project_id, story.sprint_id, Some(story.id), kind, "todo", s.title,
        s.description, "medium", None, s.story_points, s.risk, "",
    )
    .await?;
    let sub = load_by_id(&mut tx, id).await?;
    log(&mut tx, sub.id, actor, "created", "", "todo").await?;
    if s.bug {
        let event = json!({ "subtask": sub.key(), "title": s.title });
        log(&mut tx, story.id, actor, "bug_subtask_filed", "", &event.to_string()).await?;
    }
    sync_points(&mut tx, story.id).await?;
    touch(&mut tx, story.id).await?;
    let out = json!({ "key": sub.key(), "type": kind, "status": "todo", "story": story.key() });
    tx.commit().await.map_err(err)?;
    Ok(out)
}

pub async fn subtask_move(pool: &SqlitePool, key: &str, to: &str, actor: Actor) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let (sub, story) = load_subtask(&mut tx, key).await?;
    ladder::check_subtask_move(&sub.status, to)?;
    sqlx::query(
        "UPDATE tasks SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    )
    .bind(to)
    .bind(sub.id)
    .execute(&mut *tx)
    .await
    .map_err(err)?;
    log(&mut tx, sub.id, actor, "status_changed", &sub.status, to).await?;
    let event = json!({ "subtask": sub.key(), "from": sub.status, "to": to });
    log(&mut tx, story.id, actor, "subtask_status_changed", "", &event.to_string()).await?;
    sync_points(&mut tx, story.id).await?;
    let out = json!({ "key": sub.key(), "status": to, "story": story.key() });
    tx.commit().await.map_err(err)?;
    Ok(out)
}

pub async fn subtask_handoff(pool: &SqlitePool, key: &str, agent: &str, model: &str, actor: Actor) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let (sub, story) = load_subtask(&mut tx, key).await?;
    require_building(&story, "Handing a Subtask to an agent")?;
    let event = json!({ "subtask": sub.key(), "agent": agent, "model": model });
    log(&mut tx, story.id, actor, "subtask_handoff", "", &event.to_string()).await?;
    tx.commit().await.map_err(err)?;
    Ok(event)
}

pub async fn subtask_verify(pool: &SqlitePool, key: &str, passed: bool, reason: &str, actor: Actor) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let (sub, story) = load_subtask(&mut tx, key).await?;
    require_building(&story, "Verify")?;
    let round = count_events(&mut tx, story.id, "verify_round", Some(&sub.key())).await? + 1;
    let event = json!({
        "subtask": sub.key(),
        "round": round,
        "result": if passed { "pass" } else { "fail" },
        "reason": reason,
    });
    log(&mut tx, story.id, actor, "verify_round", "", &event.to_string()).await?;
    tx.commit().await.map_err(err)?;
    Ok(event)
}

// ─── Epics (FB-224) ─────────────────────────────────────────────────────────

pub struct NewEpic<'a> {
    pub project: &'a str,
    pub title: &'a str,
    pub description: &'a str,
    pub priority: &'a str,
    pub labels: &'a str,
}

fn epic_json(epic: &Row) -> Value {
    json!({
        "key": epic.key(),
        "title": epic.title,
        "type": epic.kind,
        "status": epic.status,
        "priority": epic.priority,
        "labels": epic.labels,
        "description": epic.description,
    })
}

/// Create an open epic: `todo`, outside sprints, no points, nobody assigned
/// (an epic is never built; its progress comes from its Stories).
pub async fn epic_create(pool: &SqlitePool, e: NewEpic<'_>, actor: Actor) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let (pid, ladder, _) = project_id(&mut tx, e.project).await?;
    if ladder != "factory" {
        return Err(format!("{} is a legacy project; the Factory does not write to it", e.project));
    }
    let id = insert_task(&mut tx, pid, None, None, "epic", "todo", e.title, e.description, e.priority, None, 0, false, e.labels).await?;
    log(&mut tx, id, actor, "created", "", "todo").await?;
    let out = epic_json(&load_by_id(&mut tx, id).await?);
    tx.commit().await.map_err(err)?;
    Ok(out)
}

/// Move a loaded epic inside `tx` along its lifecycle and log the change. A
/// refusal names the epic and the move.
async fn move_epic(tx: &mut Tx<'_>, epic: &Row, to: &str, actor: Actor) -> Result<(), String> {
    ladder::check_epic_move(&epic.status, to).map_err(|e| format!("{}: {e}", epic.key()))?;
    sqlx::query("UPDATE tasks SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
        .bind(to)
        .bind(epic.id)
        .execute(&mut **tx)
        .await
        .map_err(err)?;
    log(tx, epic.id, actor, "status_changed", &epic.status, to).await
}

/// Close (`done`) or cancel an open epic.
pub async fn epic_move(pool: &SqlitePool, key: &str, to: &str, actor: Actor) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let epic = load_epic(&mut tx, key).await?;
    move_epic(&mut tx, &epic, to, actor).await?;
    let out = epic_json(&load_by_id(&mut tx, epic.id).await?);
    tx.commit().await.map_err(err)?;
    Ok(out)
}

/// The membership rule (FB-224) for putting `task` in `epic`, or taking it out
/// (`None`). Only a Factory Story that is not done or canceled changes epic (a
/// done or canceled Story's epic is frozen, so past progress stays stable), and
/// it joins only an open epic of its own project. Taking it out is otherwise
/// always allowed, even from a closed epic. Keeping the current epic is not a
/// change and passes.
fn check_epic_link(task: &Row, epic: Option<&Row>) -> Result<(), String> {
    if epic.map(|e| e.id) == task.epic_id {
        return Ok(());
    }
    require_factory(task)?;
    let key = task.key();
    if is_epic(&task.kind, task.parent_id) {
        return Err(format!("{key} is an epic; only a Story joins an epic"));
    }
    if !is_story_level(&task.kind, task.parent_id) {
        return Err(format!("{key} is not a Story; only a Story joins an epic"));
    }
    if matches!(task.status.as_str(), "done" | "canceled") {
        return Err(format!("{key} is {}; a done or canceled Story keeps its epic", task.status));
    }
    let Some(epic) = epic else { return Ok(()) };
    if !is_epic(&epic.kind, epic.parent_id) {
        return Err(format!("{} is not an epic", epic.key()));
    }
    if epic.project_id != task.project_id {
        return Err(format!(
            "{} belongs to another project; {key} joins an epic of its own project only",
            epic.key()
        ));
    }
    if epic.status != "todo" {
        return Err(format!("{} is {}; a closed epic takes no new Stories", epic.key(), epic.status));
    }
    Ok(())
}

// ─── The app's edits ────────────────────────────────────────────────────────

/// Refuse the app's epic edit on task `id` when [`check_epic_link`] does.
/// `epic_id` is the payload's three-state field; absent changes nothing. The
/// caller writes the column. This read is only a fail-fast: the caller must
/// repeat the check with [`app_check_epic_in`] inside its write transaction.
///
/// On a Factory project an epic change must come alone: `status` and
/// `sprint_id` (the payload's fields, an echo of the current value is not a
/// change) go through [`app_move`], which commits on its own, so a combined
/// edit refused after that move would leave the move behind (FB-224).
pub async fn app_check_epic(
    pool: &SqlitePool,
    id: i64,
    epic_id: Option<Option<i64>>,
    status: Option<&str>,
    sprint_id: Option<Option<i64>>,
) -> Result<(), String> {
    if epic_id.is_none() {
        return Ok(());
    }
    let mut tx = pool.begin().await.map_err(err)?;
    let row = load_by_id(&mut tx, id).await?;
    let moves = status.is_some_and(|s| s != row.status) || sprint_id.is_some_and(|s| s != row.sprint_id);
    let out = if row.ladder == "factory" && epic_id != Some(row.epic_id) && moves {
        Err(format!(
            "on a Factory project, change {}'s epic separately from its status and sprint",
            row.key()
        ))
    } else {
        app_check_epic_in(&mut tx, id, epic_id).await
    };
    tx.rollback().await.map_err(err)?;
    out
}

/// [`app_check_epic`] inside the caller's transaction, so the rule is judged on
/// the rows as they are when the caller writes `epic_id` (FB-224: a concurrent
/// close of the epic or cancel of the Story cannot slip between check and write).
pub async fn app_check_epic_in(tx: &mut Tx<'_>, id: i64, epic_id: Option<Option<i64>>) -> Result<(), String> {
    let Some(epic_id) = epic_id else { return Ok(()) };
    let row = load_by_id(tx, id).await?;
    let epic = match epic_id {
        Some(e) => Some(
            sqlx::query_as::<_, Row>(&format!("{ROW_SQL} WHERE t.id = ?"))
                .bind(e)
                .fetch_optional(&mut **tx)
                .await
                .map_err(err)?
                .ok_or_else(|| format!("task {e} not found"))?,
        ),
        None => None,
    };
    check_epic_link(&row, epic.as_ref())
}

/// Apply the app's status and sprint edits on a task. On a Factory project a
/// Story's status and sprint, and a Subtask's status, go through the same
/// operations as the CLI and the MCP: same ladder, assignee rule and trail.
/// Returns `false`, changing nothing, when the task is on a legacy project.
pub async fn app_move(
    pool: &SqlitePool,
    id: i64,
    status: Option<&str>,
    sprint_id: Option<Option<i64>>,
) -> Result<bool, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let row = load_by_id(&mut tx, id).await?;
    if row.ladder != "factory" {
        return Ok(false);
    }
    let parent = match row.parent_id {
        Some(p) => Some(load_by_id(&mut tx, p).await?),
        None => None,
    };
    tx.rollback().await.map_err(err)?;

    let status = status.filter(|s| *s != row.status);
    let sprint_id = sprint_id.filter(|s| *s != row.sprint_id);
    if status.is_none() && sprint_id.is_none() {
        return Ok(true);
    }
    let key = row.key();
    let is_story = is_story_level(&row.kind, row.parent_id);
    let is_subtask = matches!(row.kind.as_str(), "subtask" | "bug")
        && parent.as_ref().is_some_and(|p| is_story_level(&p.kind, p.parent_id));
    if is_story {
        if status.is_some() && sprint_id.is_some() {
            return Err("on a Factory project, change a Story's sprint and its status separately".into());
        }
        if let Some(s) = sprint_id {
            story_set_sprint(pool, &key, s).await?;
        }
        if let Some(to) = status {
            story_move(pool, &key, to, Actor::Owner).await?;
        }
    } else if is_subtask {
        if sprint_id.is_some() {
            return Err(format!("{key} follows its Story's sprint; move the Story instead"));
        }
        if let Some(to) = status {
            subtask_move(pool, &key, to, Actor::Owner).await?;
        }
    } else if is_epic(&row.kind, row.parent_id) {
        if sprint_id.is_some() {
            return Err(format!("{key} is an epic; epics take no sprint (their Stories do)"));
        }
        if let Some(to) = status {
            epic_move(pool, &key, to, Actor::Owner).await?;
        }
    } else {
        return Err(format!("{key} is neither a Story nor a Subtask, so it has no place on the Factory ladder"));
    }
    Ok(true)
}

/// Refuse the app's points edit on a Factory Story (its points are the sum of
/// its Subtasks') and on a Factory epic (it has none). Any other task's points
/// may be edited.
pub async fn app_check_points(pool: &SqlitePool, id: i64, points: Option<i64>) -> Result<(), String> {
    let Some(points) = points else { return Ok(()) };
    let mut tx = pool.begin().await.map_err(err)?;
    let row = load_by_id(&mut tx, id).await?;
    tx.rollback().await.map_err(err)?;
    if row.ladder != "factory" || points == row.story_points {
        return Ok(());
    }
    if is_epic(&row.kind, row.parent_id) {
        return Err(format!("{} is an epic; it has no points (its progress comes from its Stories)", row.key()));
    }
    if is_story_level(&row.kind, row.parent_id) {
        return Err(format!(
            "{}'s points are the sum of its Subtasks' points; change a Subtask's points instead",
            row.key()
        ));
    }
    Ok(())
}

/// Refuse the app's parent or type edit on a Factory project when it would take
/// a Story or a Subtask off its level (a bug Story given a parent or set to
/// `subtask`, a bug Subtask losing its parent or set to `story`): the two climb
/// different ladders, and a `story` with a parent climbs neither. A top-level
/// `story` <-> `bug` change stays a Story, a `subtask` <-> `bug` change under a
/// parent stays a Subtask. An epic stays a top-level epic, and nothing becomes
/// one from a Story or a Subtask (FB-224): it would keep a status its lifecycle
/// has no move out of. `parent_id` is the payload's three-state field and
/// `kind` its type; absent changes nothing.
pub async fn app_check_level(
    pool: &SqlitePool,
    id: i64,
    parent_id: Option<Option<i64>>,
    kind: Option<&str>,
) -> Result<(), String> {
    if parent_id.is_none() && kind.is_none() {
        return Ok(());
    }
    let mut tx = pool.begin().await.map_err(err)?;
    let row = load_by_id(&mut tx, id).await?;
    tx.rollback().await.map_err(err)?;
    if row.ladder != "factory" {
        return Ok(());
    }
    // Epic, Story level, Subtask level, or neither (`None`).
    let level = |kind: &str, parent: Option<i64>| {
        if is_epic(kind, parent) {
            Some("epic")
        } else if is_story_level(kind, parent) {
            Some("story")
        } else if parent.is_some() && matches!(kind, "subtask" | "bug") {
            Some("subtask")
        } else {
            None
        }
    };
    let old = level(&row.kind, row.parent_id);
    let new = level(kind.unwrap_or(&row.kind), parent_id.unwrap_or(row.parent_id));
    if old.is_some() && old != new && (old == Some("epic") || new == Some("epic")) {
        return Err(format!(
            "on a Factory project, {} cannot become or stop being an epic, and an epic takes no parent; create a new item instead",
            row.key()
        ));
    }
    if old.is_some() && old != new {
        return Err(format!(
            "on a Factory project, {} cannot move between Story level and Subtask level; create a new item instead",
            row.key()
        ));
    }
    // A Subtask's new parent must be a Story: under an epic or another Subtask
    // it would sit on no ladder (FB-224).
    if let (Some("subtask"), Some(Some(p))) = (new, parent_id) {
        if Some(p) != row.parent_id {
            let mut tx = pool.begin().await.map_err(err)?;
            let parent = load_by_id(&mut tx, p).await?;
            tx.rollback().await.map_err(err)?;
            if !is_story_level(&parent.kind, parent.parent_id) {
                return Err(format!(
                    "on a Factory project, a Subtask goes under a Story; {} is not a Story",
                    parent.key()
                ));
            }
        }
    }
    Ok(())
}

/// After the app writes task `id` inside `tx`, bring each Factory Story the
/// write touched back to the sum of its Subtasks: the task itself when it is a
/// Story, its parent, and `old_parent`, the parent it had before the edit.
pub async fn app_sync_points(tx: &mut Transaction<'_, Sqlite>, id: i64, old_parent: Option<i64>) -> Result<(), String> {
    let row = load_by_id(tx, id).await?;
    if row.ladder != "factory" {
        return Ok(());
    }
    for story_id in [Some(row.id), row.parent_id, old_parent].into_iter().flatten() {
        let candidate = load_by_id(tx, story_id).await?;
        if is_story_level(&candidate.kind, candidate.parent_id) {
            sync_points(tx, story_id).await?;
        }
    }
    Ok(())
}

/// The status and sprint the app may create a task with. On a Factory project
/// a Story starts in backlog or refining, outside sprints; an epic starts in
/// todo, outside sprints, with no points; a Subtask starts in todo, in its
/// Story's sprint. `None` on a legacy project.
pub async fn app_create_status(
    pool: &SqlitePool,
    project_id: i64,
    parent_id: Option<i64>,
    kind: &str,
    status: Option<&str>,
    sprint_id: Option<i64>,
    story_points: Option<i64>,
) -> Result<Option<(String, Option<i64>)>, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let ladder: String = sqlx::query_scalar("SELECT ladder FROM projects WHERE id = ?")
        .bind(project_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(err)?;
    if ladder != "factory" {
        return Ok(None);
    }
    match parent_id {
        None if is_epic(kind, None) => {
            let status = status.unwrap_or("todo");
            if status != "todo" {
                return Err(format!("a new epic starts in todo, not {status}"));
            }
            if sprint_id.is_some() {
                return Err("an epic takes no sprint (its Stories do)".into());
            }
            if story_points.is_some_and(|p| p != 0) {
                return Err("an epic has no points (its progress comes from its Stories)".into());
            }
            Ok(Some((status.to_string(), None)))
        }
        None => {
            if !is_story_level(kind, None) {
                return Err(format!("on a Factory project, a {kind} belongs to a Story; create it from the Story"));
            }
            let status = status.unwrap_or("backlog");
            if !matches!(status, "backlog" | "refining") {
                return Err(format!("a new Story starts in backlog or refining, not {status}"));
            }
            if sprint_id.is_some() {
                return Err("a Story enters a sprint only at ready".into());
            }
            Ok(Some((status.to_string(), None)))
        }
        Some(p) => {
            let story = load_by_id(&mut tx, p).await?;
            if is_epic(&story.kind, story.parent_id) {
                return Err(format!("{} is an epic; it takes no Subtasks (put Stories in it instead)", story.key()));
            }
            if !is_story_level(&story.kind, story.parent_id) || !matches!(kind, "subtask" | "bug") {
                return Err("on a Factory project, only subtasks and bugs go under a Story".into());
            }
            if matches!(story.status.as_str(), "done" | "canceled") {
                return Err(format!("{} is {}; it takes no new Subtasks", story.key(), story.status));
            }
            let status = status.unwrap_or("todo");
            if status != "todo" {
                return Err(format!("a new Subtask starts in todo, not {status}"));
            }
            Ok(Some((status.to_string(), story.sprint_id)))
        }
    }
}

// ─── Releases ───────────────────────────────────────────────────────────────

async fn release_row(tx: &mut Tx<'_>, project: &str, version: &str) -> Result<(i64, i64, String, String), String> {
    let (pid, ladder, kind) = project_id(tx, project).await?;
    if ladder != "factory" {
        return Err(format!("{project} is a legacy project; the Factory does not write to it"));
    }
    let (id, state): (i64, String) = sqlx::query_as("SELECT id, state FROM releases WHERE project_id = ? AND version = ?")
        .bind(pid)
        .bind(version)
        .fetch_optional(&mut **tx)
        .await
        .map_err(err)?
        .ok_or_else(|| format!("{project} has no Release {version}"))?;
    Ok((id, pid, state, kind))
}

fn check_version(version: &str) -> Result<(), String> {
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() == 3 && parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit())) {
        Ok(())
    } else {
        Err(format!("'{version}' is not a version like 1.6.0"))
    }
}

fn version_taken(project: &str, version: &str, e: sqlx::Error) -> String {
    match e {
        sqlx::Error::Database(d) if d.message().contains("UNIQUE") => format!("{project} already has a Release {version}"),
        e => e.to_string(),
    }
}

pub async fn release_show(pool: &SqlitePool, project: &str, version: &str) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let (id, _, state, _) = release_row(&mut tx, project, version).await?;
    // `type` tells a feature Story from a bug Story (a fix), FB-52.
    let stories: Vec<(String, String, String, String)> = sqlx::query_as(
        r#"SELECT p.key || '-' || t.task_number, t.title, t.status, t.type FROM tasks t
             JOIN projects p ON p.id = t.project_id WHERE t.release_id = ? ORDER BY t.task_number"#,
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await
    .map_err(err)?;
    Ok(json!({
        "project": project.to_uppercase(),
        "version": version,
        "state": state,
        "stories": stories
            .into_iter()
            .map(|(k, t, s, kind)| json!({ "key": k, "title": t, "status": s, "type": kind })).collect::<Vec<_>>(),
    }))
}

pub async fn release_create(pool: &SqlitePool, project: &str, version: &str) -> Result<Value, String> {
    check_version(version)?;
    let mut tx = pool.begin().await.map_err(err)?;
    let (pid, ladder, _) = project_id(&mut tx, project).await?;
    if ladder != "factory" {
        return Err(format!("{project} is a legacy project; the Factory does not write to it"));
    }
    sqlx::query(
        "INSERT INTO releases (project_id, version, state, created_at) VALUES (?, ?, 'planned', strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    )
    .bind(pid)
    .bind(version)
    .execute(&mut *tx)
    .await
    .map_err(|e| version_taken(project, version, e))?;
    tx.commit().await.map_err(err)?;
    release_show(pool, project, version).await
}

/// The project's Releases, newest first, with how many Stories each holds.
pub async fn release_list(pool: &SqlitePool, project: &str) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let (pid, ladder, _) = project_id(&mut tx, project).await?;
    if ladder != "factory" {
        return Err(format!("{project} is a legacy project; the Factory does not write to it"));
    }
    let rows: Vec<(String, String, String, Option<String>, i64)> = sqlx::query_as(
        r#"SELECT r.version, r.state, r.created_at, r.released_at,
                  (SELECT COUNT(*) FROM tasks t WHERE t.release_id = r.id)
             FROM releases r WHERE r.project_id = ? ORDER BY r.id DESC"#,
    )
    .bind(pid)
    .fetch_all(&mut *tx)
    .await
    .map_err(err)?;
    Ok(json!({
        "project": project.to_uppercase(),
        "releases": rows.into_iter().map(|(v, s, c, r, n)| json!({
            "version": v, "state": s, "created_at": c, "released_at": r, "stories": n,
        })).collect::<Vec<_>>(),
    }))
}

/// Change a planned Release's version. Closed once the Release leaves planned.
pub async fn release_set_version(pool: &SqlitePool, project: &str, version: &str, new_version: &str) -> Result<Value, String> {
    check_version(new_version)?;
    let mut tx = pool.begin().await.map_err(err)?;
    let (id, _, state, _) = release_row(&mut tx, project, version).await?;
    if state != "planned" {
        return Err(format!("Release {version} is {state}; only a planned Release changes version"));
    }
    sqlx::query("UPDATE releases SET version = ? WHERE id = ?")
        .bind(new_version)
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| version_taken(project, new_version, e))?;
    tx.commit().await.map_err(err)?;
    release_show(pool, project, new_version).await
}

/// Move a Release; its picked Stories move with it in the same transaction: to
/// user_testing when the Release goes to user_testing, to done when it goes to
/// released. Refuses an empty Release, and a pick that isn't at the status the
/// move starts from (tested, or user_testing for a Release leaving user_testing).
pub async fn release_move(pool: &SqlitePool, project: &str, version: &str, to: &str, actor: Actor) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let (id, _, state, kind) = release_row(&mut tx, project, version).await?;
    ladder::check_release_move(&state, to, kind == "client")?;
    let story_to = match to {
        "user_testing" => Some("user_testing"),
        "released" => Some("done"),
        _ => None,
    };
    if let Some(story_to) = story_to {
        let picks = sqlx::query_as::<_, Row>(&format!("{ROW_SQL} WHERE t.release_id = ? ORDER BY t.task_number"))
            .bind(id)
            .fetch_all(&mut *tx)
            .await
            .map_err(err)?;
        if picks.is_empty() {
            return Err(format!("Release {version} has no picked Stories"));
        }
        let from = if state == "user_testing" { "user_testing" } else { "tested" };
        for story in &picks {
            if story.status != from {
                return Err(format!(
                    "{} is {}; every pick must be {from} for Release {version} to go to {to}",
                    story.key(),
                    story.status
                ));
            }
            move_story(&mut tx, story, story_to, actor)
                .await
                .map_err(|e| format!("{}: {e}", story.key()))?;
        }
    }
    sqlx::query(
        r#"UPDATE releases SET state = ?,
                  released_at = CASE WHEN ? = 'released' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE released_at END
            WHERE id = ?"#,
    )
    .bind(to)
    .bind(to)
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(err)?;
    tx.commit().await.map_err(err)?;
    release_show(pool, project, version).await
}

/// Pick a `tested` Story into a Release. Returns warnings (never refusals) for
/// depends-on Stories that are neither done nor in the same Release.
pub async fn release_pick(pool: &SqlitePool, version: &str, key: &str, actor: Actor) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    let (rid, _, state, _) = release_row(&mut tx, &story.project_key, version).await?;
    if !matches!(state.as_str(), "planned" | "user_testing") {
        return Err(format!("Release {version} is {state}; its pick is closed"));
    }
    if story.status != "tested" {
        return Err(format!("only tested Stories can be picked; {} is {}", story.key(), story.status));
    }
    if story.release_id == Some(rid) {
        return Err(format!("{} is already in Release {version}", story.key()));
    }
    if story.release_id.is_some() {
        return Err(format!("{} is already in another Release; remove it first", story.key()));
    }
    let warnings: Vec<String> = sqlx::query_scalar(
        r#"SELECT p.key || '-' || t.task_number || ' (' || t.status || ') is a dependency outside this Release'
             FROM task_links l JOIN tasks t ON t.id = l.depends_on_id JOIN projects p ON p.id = t.project_id
            WHERE l.task_id = ? AND t.status <> 'done' AND (t.release_id IS NULL OR t.release_id <> ?)"#,
    )
    .bind(story.id)
    .bind(rid)
    .fetch_all(&mut *tx)
    .await
    .map_err(err)?;
    sqlx::query("UPDATE tasks SET release_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
        .bind(rid)
        .bind(story.id)
        .execute(&mut *tx)
        .await
        .map_err(err)?;
    let event = json!({ "version": version, "warnings": warnings });
    log(&mut tx, story.id, actor, "release_picked", "", &event.to_string()).await?;
    tx.commit().await.map_err(err)?;
    Ok(json!({ "story": story.key(), "version": version, "warnings": warnings }))
}

pub async fn release_remove(pool: &SqlitePool, key: &str, actor: Actor) -> Result<Value, String> {
    let mut tx = pool.begin().await.map_err(err)?;
    let story = load_story(&mut tx, key).await?;
    let rid = story.release_id.ok_or_else(|| format!("{} is not in a Release", story.key()))?;
    let (version, state): (String, String) = sqlx::query_as("SELECT version, state FROM releases WHERE id = ?")
        .bind(rid)
        .fetch_one(&mut *tx)
        .await
        .map_err(err)?;
    if state == "released" {
        return Err(format!("Release {version} is already released"));
    }
    sqlx::query("UPDATE tasks SET release_id = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
        .bind(story.id)
        .execute(&mut *tx)
        .await
        .map_err(err)?;
    log(&mut tx, story.id, actor, "release_removed", "", &json!({ "version": version }).to_string()).await?;
    tx.commit().await.map_err(err)?;
    Ok(json!({ "story": story.key(), "removed_from": version }))
}
