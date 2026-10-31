use super::ops::{self, Actor, NewStory, NewSubtask};
use serde_json::Value;
use sqlx::SqlitePool;

struct Fx {
    pool: SqlitePool,
    pedro: i64,
    agent: i64,
    client: i64,
    sprint: i64,
}

async fn setup(kind: &str) -> Fx {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    let person = |name: &'static str| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, i64>("INSERT INTO people (name, email) VALUES (?, ?) RETURNING id")
                .bind(name)
                .bind(format!("{name}@test"))
                .fetch_one(&pool)
                .await
                .unwrap()
        }
    };
    let pedro = person("Pedro").await;
    let agent = person("Claude").await;
    let client = person("Client").await;
    for key in ["SF", "LG"] {
        sqlx::query("INSERT INTO projects (name, key, created_at) VALUES (?, ?, '2026-01-01T00:00:00.000Z')")
            .bind(key)
            .bind(key)
            .execute(&pool)
            .await
            .unwrap();
    }
    let sprint = sqlx::query_scalar::<_, i64>(
        r#"INSERT INTO sprints (project_id, name, goal, start_date, end_date, status)
           VALUES ((SELECT id FROM projects WHERE key = 'SF'), 'S1', '', '2026-01-01', '2026-01-14', 'active')
           RETURNING id"#,
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    ops::people_set_role(&pool, pedro, Some("owner")).await.unwrap();
    ops::people_set_role(&pool, agent, Some("agent")).await.unwrap();
    ops::project_set(&pool, "SF", Some("factory"), Some(kind)).await.unwrap();
    ops::contact_add(&pool, "SF", client, true).await.unwrap();
    Fx { pool, pedro, agent, client, sprint }
}

async fn story(fx: &Fx, title: &str) -> String {
    let s = ops::story_create(
        &fx.pool,
        NewStory { project: "SF", title, description: "", priority: "medium", labels: "", bug: false },
        Actor::Owner,
    )
    .await
    .unwrap();
    s["key"].as_str().unwrap().to_string()
}

async fn subtask(fx: &Fx, story: &str, bug: bool) -> String {
    let s = ops::subtask_create(
        &fx.pool,
        NewSubtask { story, title: "slice", description: "", bug, story_points: 2, risk: false },
        Actor::Agent,
    )
    .await
    .unwrap();
    s["key"].as_str().unwrap().to_string()
}

async fn mv(fx: &Fx, key: &str, to: &str) -> Result<Value, String> {
    ops::story_move(&fx.pool, key, to, Actor::Owner).await
}

async fn assignee(fx: &Fx, key: &str) -> Option<i64> {
    let n: i64 = key.rsplit_once('-').unwrap().1.parse().unwrap();
    sqlx::query_scalar("SELECT assignee_id FROM tasks WHERE task_number = ? AND project_id = (SELECT id FROM projects WHERE key = 'SF')")
        .bind(n)
        .fetch_one(&fx.pool)
        .await
        .unwrap()
}

/// Give a Story the points a split would, so it may move to `ready`.
async fn sized(fx: &Fx, key: &str) {
    let n: i64 = key.rsplit_once('-').unwrap().1.parse().unwrap();
    sqlx::query("UPDATE tasks SET story_points = 3 WHERE task_number = ? AND project_id = (SELECT id FROM projects WHERE key = 'SF')")
        .bind(n)
        .execute(&fx.pool)
        .await
        .unwrap();
}

/// Take a Story to `ready` and into the sprint.
async fn ready_in_sprint(fx: &Fx, key: &str) {
    sized(fx, key).await;
    mv(fx, key, "refining").await.unwrap();
    mv(fx, key, "ready").await.unwrap();
    ops::story_set_sprint(&fx.pool, key, Some(fx.sprint)).await.unwrap();
}

async fn finish_subtask(fx: &Fx, key: &str) {
    ops::subtask_move(&fx.pool, key, "in_progress", Actor::Agent).await.unwrap();
    ops::subtask_move(&fx.pool, key, "done", Actor::Agent).await.unwrap();
}

async fn actions(fx: &Fx, key: &str) -> Vec<String> {
    ops::trail(&fx.pool, key)
        .await
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["action"].as_str().unwrap().to_string())
        .collect()
}

#[tokio::test]
async fn subtask_create_stores_and_returns_the_subtask_type() {
    let fx = setup("internal").await;
    let s = story(&fx, "types").await;
    let created = ops::subtask_create(
        &fx.pool,
        NewSubtask { story: &s, title: "slice", description: "", bug: false, story_points: 1, risk: false },
        Actor::Agent,
    )
    .await
    .unwrap();
    assert_eq!(created["type"], "subtask");
    let stored: String = sqlx::query_scalar("SELECT type FROM tasks WHERE title = 'slice'")
        .fetch_one(&fx.pool)
        .await
        .unwrap();
    assert_eq!(stored, "subtask");
}

#[tokio::test]
async fn internal_story_walks_the_whole_ladder_with_assignees() {
    let fx = setup("internal").await;
    let s = story(&fx, "walk").await;
    assert_eq!(assignee(&fx, &s).await, Some(fx.pedro));
    let sub = subtask(&fx, &s, false).await;
    ready_in_sprint(&fx, &s).await;

    mv(&fx, &s, "building").await.unwrap();
    assert_eq!(assignee(&fx, &s).await, Some(fx.agent));
    ops::subtask_handoff(&fx.pool, &sub, "implementer", "claude-sonnet-5-5", Actor::Agent).await.unwrap();
    finish_subtask(&fx, &sub).await;
    ops::subtask_verify(&fx.pool, &sub, true, "gates green", Actor::Agent).await.unwrap();
    ops::review_record(&fx.pool, &s, "passed", "abc123", None, Actor::Agent).await.unwrap();
    ops::pr_open(&fx.pool, &s, "https://github.com/x/y/pull/1", "develop", Actor::Agent).await.unwrap();
    ops::pr_set_state(&fx.pool, &s, "https://github.com/x/y/pull/1", "merged", Actor::Agent).await.unwrap();

    mv(&fx, &s, "integrated_tests").await.unwrap();
    assert_eq!(assignee(&fx, &s).await, Some(fx.pedro));
    mv(&fx, &s, "tested").await.unwrap();
    let done = mv(&fx, &s, "done").await.unwrap();
    assert_eq!(done["status"], "done");
    assert_eq!(assignee(&fx, &s).await, None);
    assert_eq!(done["review"]["verdict"], "passed");
    assert_eq!(done["prs"][0]["state"], "merged");

    let trail = actions(&fx, &s).await;
    for a in [
        "created", "stage_entered", "subtask_status_changed", "subtask_handoff",
        "verify_round", "review_round", "pr_opened", "pr_merged",
    ] {
        assert!(trail.iter().any(|t| t == a), "trail is missing {a}: {trail:?}");
    }
}

#[tokio::test]
async fn client_story_goes_through_user_testing_to_the_primary_contact() {
    let fx = setup("client").await;
    let s = story(&fx, "client").await;
    ready_in_sprint(&fx, &s).await;
    for to in ["building", "integrated_tests", "tested"] {
        mv(&fx, &s, to).await.unwrap();
    }
    assert!(mv(&fx, &s, "done").await.is_err());
    mv(&fx, &s, "user_testing").await.unwrap();
    assert_eq!(assignee(&fx, &s).await, Some(fx.client));
    mv(&fx, &s, "done").await.unwrap();
}

#[tokio::test]
async fn illegal_moves_are_refused_and_change_nothing() {
    let fx = setup("internal").await;
    let s = story(&fx, "illegal").await;
    let before = actions(&fx, &s).await.len();

    assert!(mv(&fx, &s, "building").await.is_err(), "skip from backlog");
    assert!(mv(&fx, &s, "ready_for_development").await.is_err(), "legacy status");
    mv(&fx, &s, "refining").await.unwrap();
    sized(&fx, &s).await;
    mv(&fx, &s, "ready").await.unwrap();
    let err = mv(&fx, &s, "building").await.unwrap_err();
    assert!(err.contains("sprint"), "{err}");
    assert!(mv(&fx, &s, "user_testing").await.is_err(), "user_testing on an Internal project");

    let shown = ops::story_show(&fx.pool, &s).await.unwrap();
    assert_eq!(shown["status"], "ready");
    assert_eq!(actions(&fx, &s).await.len(), before + 2, "refusals must not log");
}

#[tokio::test]
async fn open_subtasks_and_a_stopped_run_hold_the_story() {
    let fx = setup("internal").await;
    let s = story(&fx, "held").await;
    let sub = subtask(&fx, &s, false).await;
    ready_in_sprint(&fx, &s).await;
    mv(&fx, &s, "building").await.unwrap();

    let err = mv(&fx, &s, "integrated_tests").await.unwrap_err();
    assert!(err.contains("open Subtask"), "{err}");
    finish_subtask(&fx, &sub).await;

    ops::run_stop(&fx.pool, &s, "2 failed Verify rounds", Actor::Agent).await.unwrap();
    assert_eq!(assignee(&fx, &s).await, Some(fx.pedro), "a stopped Run is Pedro's move");
    let err = mv(&fx, &s, "integrated_tests").await.unwrap_err();
    assert!(err.contains("stopped"), "{err}");
    let shown = ops::run_restart(&fx.pool, &s, Actor::Owner).await.unwrap();
    assert_eq!(shown["flags"]["stopped"], false);
    assert_eq!(assignee(&fx, &s).await, Some(fx.agent));
    mv(&fx, &s, "integrated_tests").await.unwrap();
}

#[tokio::test]
async fn bug_subtask_flags_the_story_and_loops_back_to_building() {
    let fx = setup("internal").await;
    let s = story(&fx, "bugs").await;
    ready_in_sprint(&fx, &s).await;
    mv(&fx, &s, "building").await.unwrap();
    mv(&fx, &s, "integrated_tests").await.unwrap();

    let bug = subtask(&fx, &s, true).await;
    let shown = ops::story_show(&fx.pool, &s).await.unwrap();
    assert_eq!(shown["flags"]["waiting_on_bugs"], 1);
    assert_eq!(shown["subtasks"][0]["type"], "bug");
    assert!(mv(&fx, &s, "tested").await.is_err());
    assert!(actions(&fx, &s).await.contains(&"bug_subtask_filed".to_string()));

    mv(&fx, &s, "building").await.unwrap();
    finish_subtask(&fx, &bug).await;
    mv(&fx, &s, "integrated_tests").await.unwrap();
    let shown = ops::story_show(&fx.pool, &s).await.unwrap();
    assert_eq!(shown["flags"]["waiting_on_bugs"], 0);
}

#[tokio::test]
async fn verify_and_review_rounds_are_numbered() {
    let fx = setup("internal").await;
    let s = story(&fx, "rounds").await;
    let sub = subtask(&fx, &s, false).await;
    ready_in_sprint(&fx, &s).await;
    mv(&fx, &s, "building").await.unwrap();
    let r1 = ops::subtask_verify(&fx.pool, &sub, false, "tests red", Actor::Agent).await.unwrap();
    let r2 = ops::subtask_verify(&fx.pool, &sub, true, "", Actor::Agent).await.unwrap();
    assert_eq!((r1["round"].as_i64(), r2["round"].as_i64()), (Some(1), Some(2)));
    ops::review_record(&fx.pool, &s, "failed", "c1", Some("https://f/1"), Actor::Agent).await.unwrap();
    ops::review_record(&fx.pool, &s, "passed", "c2", None, Actor::Agent).await.unwrap();
    let trail = ops::trail(&fx.pool, &s).await.unwrap();
    let reviews: Vec<i64> = trail
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["action"] == "review_round")
        .map(|e| e["new"]["round"].as_i64().unwrap())
        .collect();
    assert_eq!(reviews, vec![1, 2]);
}

/// The `new_value` of every `review_started` row on a Story, oldest first.
async fn review_starts(fx: &Fx, key: &str) -> Vec<Value> {
    ops::trail(&fx.pool, key)
        .await
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["action"] == "review_started")
        .map(|e| e["new"].clone())
        .collect()
}

#[tokio::test]
async fn review_start_logs_the_round_about_to_run() {
    let fx = setup("internal").await;
    let s = story(&fx, "review start").await;
    // An open Subtask must not block it: manual Reviews still work.
    subtask(&fx, &s, false).await;
    ready_in_sprint(&fx, &s).await;
    mv(&fx, &s, "building").await.unwrap();

    ops::review_start(&fx.pool, &s, Actor::Agent).await.unwrap();
    assert_eq!(review_starts(&fx, &s).await, vec![serde_json::json!({ "round": 1 })]);

    ops::review_record(&fx.pool, &s, "failed", "c1", None, Actor::Agent).await.unwrap();
    ops::review_start(&fx.pool, &s, Actor::Agent).await.unwrap();
    assert_eq!(
        review_starts(&fx, &s).await,
        vec![serde_json::json!({ "round": 1 }), serde_json::json!({ "round": 2 })]
    );
}

#[tokio::test]
async fn review_start_is_refused_off_building_and_on_a_stopped_run() {
    let fx = setup("internal").await;
    let s = story(&fx, "refused start").await;
    ready_in_sprint(&fx, &s).await;
    let rows = || async {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM activity_log WHERE action = 'review_started'")
            .fetch_one(&fx.pool)
            .await
            .unwrap()
    };

    let err = ops::review_start(&fx.pool, &s, Actor::Agent).await.unwrap_err();
    assert!(err.contains("building"), "{err}");

    mv(&fx, &s, "building").await.unwrap();
    ops::run_stop(&fx.pool, &s, "held", Actor::Agent).await.unwrap();
    let err = ops::review_start(&fx.pool, &s, Actor::Agent).await.unwrap_err();
    assert!(err.contains("stopped"), "{err}");

    assert_eq!(rows().await, 0, "a refused review_start must not log");
}

/// The `new_value` of every `verify_started` row on a Story, oldest first.
async fn verify_starts(fx: &Fx, key: &str) -> Vec<Value> {
    ops::trail(&fx.pool, key)
        .await
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["action"] == "verify_started")
        .map(|e| e["new"].clone())
        .collect()
}

#[tokio::test]
async fn verify_start_logs_the_subtask_round_about_to_run() {
    let fx = setup("internal").await;
    let s = story(&fx, "verify start").await;
    let sub = subtask(&fx, &s, false).await;
    ready_in_sprint(&fx, &s).await;
    mv(&fx, &s, "building").await.unwrap();
    ops::subtask_move(&fx.pool, &sub, "in_progress", Actor::Agent).await.unwrap();

    ops::verify_start(&fx.pool, &sub, Actor::Agent).await.unwrap();
    assert_eq!(verify_starts(&fx, &s).await, vec![serde_json::json!({ "subtask": sub, "round": 1 })]);

    ops::subtask_verify(&fx.pool, &sub, false, "tests red", Actor::Agent).await.unwrap();
    ops::verify_start(&fx.pool, &sub, Actor::Agent).await.unwrap();
    assert_eq!(
        verify_starts(&fx, &s).await,
        vec![
            serde_json::json!({ "subtask": sub, "round": 1 }),
            serde_json::json!({ "subtask": sub, "round": 2 }),
        ]
    );
}

#[tokio::test]
async fn verify_start_is_refused_off_building_on_a_stopped_run_and_off_in_progress() {
    let fx = setup("internal").await;
    let s = story(&fx, "refused verify").await;
    let sub = subtask(&fx, &s, false).await;
    let rows = || async {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM activity_log WHERE action = 'verify_started'")
            .fetch_one(&fx.pool)
            .await
            .unwrap()
    };
    ready_in_sprint(&fx, &s).await;

    // An in_progress Subtask whose Story isn't building.
    ops::subtask_move(&fx.pool, &sub, "in_progress", Actor::Agent).await.unwrap();
    let err = ops::verify_start(&fx.pool, &sub, Actor::Agent).await.unwrap_err();
    assert!(err.contains("building"), "{err}");
    assert_eq!(rows().await, 0);

    // A stopped Run.
    mv(&fx, &s, "building").await.unwrap();
    ops::run_stop(&fx.pool, &s, "held", Actor::Agent).await.unwrap();
    let err = ops::verify_start(&fx.pool, &sub, Actor::Agent).await.unwrap_err();
    assert!(err.contains("stopped"), "{err}");
    assert_eq!(rows().await, 0);
    ops::run_restart(&fx.pool, &s, Actor::Owner).await.unwrap();

    // A todo Subtask.
    ops::subtask_move(&fx.pool, &sub, "todo", Actor::Agent).await.unwrap();
    let err = ops::verify_start(&fx.pool, &sub, Actor::Agent).await.unwrap_err();
    assert!(err.contains("not in_progress"), "{err}");
    assert_eq!(rows().await, 0);

    // A done Subtask.
    ops::subtask_move(&fx.pool, &sub, "in_progress", Actor::Agent).await.unwrap();
    ops::subtask_move(&fx.pool, &sub, "done", Actor::Agent).await.unwrap();
    let err = ops::verify_start(&fx.pool, &sub, Actor::Agent).await.unwrap_err();
    assert!(err.contains("not in_progress"), "{err}");

    assert_eq!(rows().await, 0, "a refused verify_start must not log");
}

#[tokio::test]
async fn verify_start_refuses_in_order_and_numbers_rounds_per_subtask() {
    let fx = setup("internal").await;
    let s = story(&fx, "verify order").await;
    let a = subtask(&fx, &s, false).await;
    let b = subtask(&fx, &s, false).await;
    ready_in_sprint(&fx, &s).await;

    // A todo Subtask on a Story that isn't building: the building check comes first.
    let err = ops::verify_start(&fx.pool, &a, Actor::Agent).await.unwrap_err();
    assert!(err.contains("Starting a Verify"), "{err}");

    // A todo Subtask on a stopped Run: the stopped check comes before in_progress.
    mv(&fx, &s, "building").await.unwrap();
    ops::run_stop(&fx.pool, &s, "held", Actor::Agent).await.unwrap();
    let err = ops::verify_start(&fx.pool, &a, Actor::Agent).await.unwrap_err();
    assert!(err.contains("stopped"), "{err}");
    ops::run_restart(&fx.pool, &s, Actor::Owner).await.unwrap();

    // Another Subtask's failed Verify rounds don't advance this one's round.
    ops::subtask_move(&fx.pool, &a, "in_progress", Actor::Agent).await.unwrap();
    ops::subtask_move(&fx.pool, &b, "in_progress", Actor::Agent).await.unwrap();
    ops::subtask_verify(&fx.pool, &a, false, "tests red", Actor::Agent).await.unwrap();
    let got = ops::verify_start(&fx.pool, &b, Actor::Agent).await.unwrap();
    assert_eq!(got, serde_json::json!({ "subtask": b, "round": 1 }));
    assert_eq!(verify_starts(&fx, &s).await, vec![serde_json::json!({ "subtask": b, "round": 1 })]);
}

#[tokio::test]
async fn sprint_entry_and_exit_only_at_ready_and_subtasks_follow() {
    let fx = setup("internal").await;
    let s = story(&fx, "sprint").await;
    let sub = subtask(&fx, &s, false).await;
    let err = ops::story_set_sprint(&fx.pool, &s, Some(fx.sprint)).await.unwrap_err();
    assert!(err.contains("only at ready"), "{err}");
    ready_in_sprint(&fx, &s).await;
    let sub_sprint: Option<i64> = sqlx::query_scalar("SELECT sprint_id FROM tasks WHERE parent_id IS NOT NULL")
        .fetch_one(&fx.pool)
        .await
        .unwrap();
    assert_eq!(sub_sprint, Some(fx.sprint), "{sub} must follow its Story into the sprint");
    mv(&fx, &s, "building").await.unwrap();
    assert!(ops::story_set_sprint(&fx.pool, &s, None).await.is_err());

    let next = sqlx::query_scalar::<_, i64>(
        r#"INSERT INTO sprints (project_id, name, goal, start_date, end_date, status)
           VALUES ((SELECT id FROM projects WHERE key = 'SF'), 'S2', '', '2026-01-15', '2026-01-28', 'backlog')
           RETURNING id"#,
    )
    .fetch_one(&fx.pool)
    .await
    .unwrap();
    ops::story_set_sprint(&fx.pool, &s, Some(next)).await.expect("carry over between sprints");
}

#[tokio::test]
async fn legacy_projects_are_refused() {
    let fx = setup("internal").await;
    let err = ops::story_create(
        &fx.pool,
        NewStory { project: "LG", title: "x", description: "", priority: "medium", labels: "", bug: false },
        Actor::Owner,
    )
    .await
    .unwrap_err();
    assert!(err.contains("legacy"), "{err}");

    sqlx::query(
        r#"INSERT INTO tasks (project_id, task_number, title, type, status, created_at, updated_at)
           VALUES ((SELECT id FROM projects WHERE key = 'LG'), 1, 'old', 'story', 'todo', 'x', 'x')"#,
    )
    .execute(&fx.pool)
    .await
    .unwrap();
    assert!(mv(&fx, "LG-1", "refining").await.unwrap_err().contains("legacy"));
    let err = ops::project_set(&fx.pool, "LG", Some("factory"), None).await.unwrap_err();
    assert!(err.contains("open item"), "{err}");
    let err = ops::story_comment(&fx.pool, "LG-1", "hi", Actor::Agent).await.unwrap_err();
    assert!(err.contains("legacy"), "{err}");
}

#[tokio::test]
async fn a_comment_is_posted_as_the_actor() {
    let fx = setup("internal").await;
    let s = story(&fx, "Commented").await;
    let c = ops::story_comment(&fx.pool, &s, "## Findings\n- none", Actor::Agent).await.unwrap();
    let id = c["id"].as_i64().unwrap();
    assert_eq!(c["url"], format!("flowboard://comment/{id}"));
    let (author, body): (i64, String) = sqlx::query_as("SELECT author_id, body FROM comments WHERE id = ?")
        .bind(id)
        .fetch_one(&fx.pool)
        .await
        .unwrap();
    assert_eq!(author, fx.agent);
    assert_eq!(body, "## Findings\n- none");

    let c = ops::story_comment(&fx.pool, &s, "from Pedro", Actor::Owner).await.unwrap();
    assert_eq!(c["author_id"], fx.pedro);
}

#[tokio::test]
async fn a_comment_needs_a_body_and_a_story() {
    let fx = setup("internal").await;
    let s = story(&fx, "Parent").await;
    assert!(ops::story_comment(&fx.pool, &s, "  \n", Actor::Agent).await.unwrap_err().contains("body"));
    let sub = subtask(&fx, &s, false).await;
    assert!(ops::story_comment(&fx.pool, &sub, "x", Actor::Agent).await.unwrap_err().contains("not a Story"));
}

#[tokio::test]
async fn a_legacy_project_switches_once_its_open_items_are_mapped() {
    let fx = setup("internal").await;
    let insert = |n: i64, parent: Option<i64>, kind: &'static str, status: &'static str| {
        let pool = fx.pool.clone();
        async move {
            sqlx::query(
                r#"INSERT INTO tasks (project_id, task_number, parent_id, title, type, status, created_at, updated_at)
                   VALUES ((SELECT id FROM projects WHERE key = 'LG'), ?,
                           (SELECT id FROM tasks WHERE task_number = ? AND project_id = (SELECT id FROM projects WHERE key = 'LG')),
                           'old', ?, ?, 'x', 'x')"#,
            )
            .bind(n)
            .bind(parent)
            .bind(kind)
            .bind(status)
            .execute(&pool)
            .await
            .unwrap();
        }
    };
    insert(1, None, "story", "todo").await;
    insert(2, Some(1), "subtask", "in_review").await;
    insert(3, None, "bug", "refining").await;
    insert(4, None, "story", "done").await;
    insert(5, Some(4), "subtask", "canceled").await;
    // Epics (FB-224): open at todo and closed are mapped; in_progress is not.
    insert(6, None, "epic", "todo").await;
    insert(7, None, "epic", "done").await;
    insert(8, None, "epic", "in_progress").await;

    let err = ops::project_set(&fx.pool, "LG", Some("factory"), None).await.unwrap_err();
    assert!(err.contains("3 open item(s)") && err.contains("LG-1, LG-2, LG-8"), "{err}");
    assert!(!err.contains("LG-3"), "a top-level bug at refining is a mapped Story (FB-52): {err}");
    assert!(!err.contains("LG-6"), "an open epic at todo is mapped: {err}");

    let map = |sql: &'static str| {
        let pool = fx.pool.clone();
        async move { sqlx::query(sql).execute(&pool).await.unwrap() }
    };
    map("UPDATE tasks SET status = 'backlog' WHERE task_number = 1").await;
    map("UPDATE tasks SET status = 'todo' WHERE task_number = 2").await;
    map("UPDATE tasks SET status = 'todo' WHERE task_number = 8").await;
    ops::project_set(&fx.pool, "LG", Some("factory"), None).await.expect("every open item is mapped");
    assert_eq!(mv(&fx, "LG-1", "refining").await.unwrap()["status"], "refining");
    assert_eq!(mv(&fx, "LG-3", "backlog").await.unwrap()["status"], "backlog", "the bug Story is on the Story ladder");
}

#[tokio::test]
async fn a_legacy_epic_with_a_sprint_points_or_parent_blocks_the_switch() {
    use crate::test_support::{self as ts, SprintStatus, TaskStatus, TaskType};
    let pool = ts::pool().await;
    let p = ts::project(&pool, "LG").await;
    let sprint = ts::sprint(&pool, p, "S1", "2026-10-01", SprintStatus::Active).await;
    let scheduled = ts::task(&pool, p, Some(sprint), None, TaskType::Epic, TaskStatus::Todo).await;
    let pointed = ts::task(&pool, p, None, None, TaskType::Epic, TaskStatus::Todo).await;
    let closed = ts::task(&pool, p, Some(sprint), None, TaskType::Epic, TaskStatus::Done).await;
    let nested = ts::task(&pool, p, None, Some(pointed), TaskType::Epic, TaskStatus::Todo).await;
    let well_formed = ts::task(&pool, p, None, None, TaskType::Epic, TaskStatus::Todo).await;
    sqlx::query("UPDATE tasks SET story_points = 5 WHERE id = ?").bind(pointed).execute(&pool).await.unwrap();

    let err = ops::project_set(&pool, "LG", Some("factory"), None).await.unwrap_err();
    assert!(err.contains("LG-1, LG-2, LG-3, LG-4") && !err.contains("LG-5"), "{err}");
    let ladder: String = sqlx::query_scalar("SELECT ladder FROM projects WHERE id = ?").bind(p).fetch_one(&pool).await.unwrap();
    assert_eq!(ladder, "legacy", "a refused switch changes nothing");

    sqlx::query("UPDATE tasks SET sprint_id = NULL, story_points = 0 WHERE id IN (?, ?, ?)")
        .bind(scheduled)
        .bind(pointed)
        .bind(closed)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE tasks SET parent_id = NULL WHERE id = ?").bind(nested).execute(&pool).await.unwrap();
    ops::project_set(&pool, "LG", Some("factory"), None).await.expect("well-formed epics switch");
    assert_eq!(epic_of(&pool, well_formed).await, None);
}

#[tokio::test]
async fn release_pick_warns_on_unreleased_dependencies() {
    let fx = setup("internal").await;
    let a = story(&fx, "a").await;
    let b = story(&fx, "b").await;
    ops::link_add(&fx.pool, &b, &a).await.unwrap();
    ready_in_sprint(&fx, &b).await;
    for to in ["building", "integrated_tests"] {
        mv(&fx, &b, to).await.unwrap();
    }
    ops::release_create(&fx.pool, "SF", "1.6.0").await.unwrap();
    let err = ops::release_pick(&fx.pool, "1.6.0", &b, Actor::Owner).await.unwrap_err();
    assert!(err.contains("only tested"), "{err}");
    mv(&fx, &b, "tested").await.unwrap();

    let picked = ops::release_pick(&fx.pool, "1.6.0", &b, Actor::Owner).await.unwrap();
    assert_eq!(picked["warnings"].as_array().unwrap().len(), 1, "{picked}");
    let shown = ops::release_show(&fx.pool, "SF", "1.6.0").await.unwrap();
    assert_eq!(shown["stories"][0]["key"], b.as_str());

    ops::release_remove(&fx.pool, &b, Actor::Owner).await.unwrap();
    assert!(actions(&fx, &b).await.contains(&"release_removed".to_string()));
    assert!(ops::release_move(&fx.pool, "SF", "1.6.0", "user_testing", Actor::Owner).await.is_err());
    assert!(ops::release_create(&fx.pool, "SF", "1.6").await.is_err());
}

async fn tested(fx: &Fx, title: &str) -> String {
    let s = story(fx, title).await;
    ready_in_sprint(fx, &s).await;
    for to in ["building", "integrated_tests", "tested"] {
        mv(fx, &s, to).await.unwrap();
    }
    s
}

async fn status(fx: &Fx, key: &str) -> String {
    ops::story_show(&fx.pool, key).await.unwrap()["status"].as_str().unwrap().to_string()
}

async fn release_state(fx: &Fx, version: &str) -> String {
    ops::release_show(&fx.pool, "SF", version).await.unwrap()["state"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn releasing_moves_the_picked_stories_to_done() {
    let fx = setup("internal").await;
    let a = tested(&fx, "a").await;
    let b = tested(&fx, "b").await;
    ops::release_create(&fx.pool, "SF", "1.6.0").await.unwrap();
    for k in [&a, &b] {
        ops::release_pick(&fx.pool, "1.6.0", k, Actor::Owner).await.unwrap();
    }

    ops::release_move(&fx.pool, "SF", "1.6.0", "released", Actor::Agent).await.unwrap();
    assert_eq!(release_state(&fx, "1.6.0").await, "released");
    for k in [&a, &b] {
        assert_eq!(status(&fx, k).await, "done");
        assert_eq!(assignee(&fx, k).await, None);
        assert_eq!(actions(&fx, k).await.last().unwrap(), "stage_entered");
    }
}

#[tokio::test]
async fn release_move_refuses_an_empty_release_and_a_pick_that_is_not_ready() {
    let fx = setup("internal").await;
    ops::release_create(&fx.pool, "SF", "1.6.0").await.unwrap();
    let err = ops::release_move(&fx.pool, "SF", "1.6.0", "released", Actor::Agent).await.unwrap_err();
    assert!(err.contains("no picked Stories"), "{err}");

    let a = tested(&fx, "a").await;
    let b = tested(&fx, "b").await;
    for k in [&a, &b] {
        ops::release_pick(&fx.pool, "1.6.0", k, Actor::Owner).await.unwrap();
    }
    mv(&fx, &b, "building").await.unwrap();
    let err = ops::release_move(&fx.pool, "SF", "1.6.0", "released", Actor::Agent).await.unwrap_err();
    assert!(err.contains(&format!("{b} is building")), "{err}");
    assert_eq!(status(&fx, &a).await, "tested", "a refused move changes no pick");
    assert_eq!(release_state(&fx, "1.6.0").await, "planned");

    // A pick the ladder itself refuses (a stopped Run) is refused the same way.
    mv(&fx, &b, "integrated_tests").await.unwrap();
    mv(&fx, &b, "tested").await.unwrap();
    sqlx::query("UPDATE tasks SET run_stopped = 1 WHERE task_number = ? AND project_id = (SELECT id FROM projects WHERE key = 'SF')")
        .bind(b.rsplit_once('-').unwrap().1.parse::<i64>().unwrap())
        .execute(&fx.pool)
        .await
        .unwrap();
    let err = ops::release_move(&fx.pool, "SF", "1.6.0", "released", Actor::Agent).await.unwrap_err();
    assert!(err.starts_with(&format!("{b}: ")) && err.contains("Run is stopped"), "{err}");
    assert_eq!(status(&fx, &a).await, "tested");
    assert_eq!(release_state(&fx, "1.6.0").await, "planned");

    let empty = "1.7.0";
    ops::release_create(&fx.pool, "SF", empty).await.unwrap();
    ops::release_move(&fx.pool, "SF", empty, "canceled", Actor::Agent).await.expect("an empty Release can be canceled");
}

#[tokio::test]
async fn client_release_carries_its_stories_through_user_testing() {
    let fx = setup("client").await;
    let a = tested(&fx, "a").await;
    let b = tested(&fx, "b").await;
    ops::release_create(&fx.pool, "SF", "2.0.0").await.unwrap();
    for k in [&a, &b] {
        ops::release_pick(&fx.pool, "2.0.0", k, Actor::Owner).await.unwrap();
    }

    ops::release_move(&fx.pool, "SF", "2.0.0", "user_testing", Actor::Agent).await.unwrap();
    for k in [&a, &b] {
        assert_eq!(status(&fx, k).await, "user_testing");
        assert_eq!(assignee(&fx, k).await, Some(fx.client));
    }

    // The bug loop sends one back to building; the Release can't be released until it returns.
    mv(&fx, &b, "building").await.unwrap();
    let err = ops::release_move(&fx.pool, "SF", "2.0.0", "released", Actor::Agent).await.unwrap_err();
    assert!(err.contains(&format!("{b} is building")) && err.contains("must be user_testing"), "{err}");
    assert_eq!(status(&fx, &a).await, "user_testing");

    for to in ["integrated_tests", "tested", "user_testing"] {
        mv(&fx, &b, to).await.unwrap();
    }
    ops::release_move(&fx.pool, "SF", "2.0.0", "released", Actor::Agent).await.unwrap();
    for k in [&a, &b] {
        assert_eq!(status(&fx, k).await, "done");
    }
}

#[tokio::test]
async fn release_set_version_only_while_planned() {
    let fx = setup("internal").await;
    ops::release_create(&fx.pool, "SF", "1.6.0").await.unwrap();
    ops::release_create(&fx.pool, "SF", "1.5.2").await.unwrap();

    let err = ops::release_set_version(&fx.pool, "SF", "1.6.0", "1.6").await.unwrap_err();
    assert!(err.contains("not a version"), "{err}");
    let err = ops::release_set_version(&fx.pool, "SF", "1.6.0", "1.5.2").await.unwrap_err();
    assert!(err.contains("already has a Release 1.5.2"), "{err}");
    let err = ops::release_set_version(&fx.pool, "SF", "9.9.9", "1.7.0").await.unwrap_err();
    assert!(err.contains("no Release 9.9.9"), "{err}");

    let shown = ops::release_set_version(&fx.pool, "SF", "1.6.0", "1.7.0").await.unwrap();
    assert_eq!(shown["version"], "1.7.0");
    assert!(ops::release_show(&fx.pool, "SF", "1.6.0").await.is_err());

    ops::release_move(&fx.pool, "SF", "1.7.0", "canceled", Actor::Agent).await.unwrap();
    let err = ops::release_set_version(&fx.pool, "SF", "1.7.0", "1.8.0").await.unwrap_err();
    assert!(err.contains("is canceled"), "{err}");
}

#[tokio::test]
async fn release_list_shows_each_release_with_its_story_count() {
    let fx = setup("internal").await;
    assert_eq!(ops::release_list(&fx.pool, "sf").await.unwrap()["releases"], serde_json::json!([]));
    let a = tested(&fx, "a").await;
    ops::release_create(&fx.pool, "SF", "1.6.0").await.unwrap();
    ops::release_create(&fx.pool, "SF", "1.7.0").await.unwrap();
    ops::release_pick(&fx.pool, "1.6.0", &a, Actor::Owner).await.unwrap();
    ops::release_move(&fx.pool, "SF", "1.6.0", "released", Actor::Agent).await.unwrap();

    let list = ops::release_list(&fx.pool, "SF").await.unwrap();
    let rs = list["releases"].as_array().unwrap();
    assert_eq!(rs.len(), 2);
    assert_eq!((rs[0]["version"].as_str(), rs[0]["state"].as_str(), rs[0]["stories"].as_i64()), (Some("1.7.0"), Some("planned"), Some(0)));
    assert_eq!((rs[1]["version"].as_str(), rs[1]["state"].as_str(), rs[1]["stories"].as_i64()), (Some("1.6.0"), Some("released"), Some(1)));
    assert!(rs[1]["released_at"].is_string());

    let err = ops::release_list(&fx.pool, "LG").await.unwrap_err();
    assert!(err.contains("legacy"), "{err}");
}

#[tokio::test]
async fn missing_factory_roles_give_an_actionable_error() {
    let fx = setup("internal").await;
    ops::people_set_role(&fx.pool, fx.pedro, None).await.unwrap();
    let err = ops::story_create(
        &fx.pool,
        NewStory { project: "SF", title: "x", description: "", priority: "medium", labels: "", bug: false },
        Actor::Owner,
    )
    .await
    .unwrap_err();
    assert!(err.contains("set-role"), "{err}");
}

#[tokio::test]
async fn setting_a_role_hands_it_over() {
    let fx = setup("internal").await;
    ops::people_set_role(&fx.pool, fx.client, Some("owner")).await.unwrap();
    let owners: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM people WHERE factory_role = 'owner'")
        .fetch_one(&fx.pool)
        .await
        .unwrap();
    assert_eq!(owners, 1);
}

#[tokio::test]
async fn active_runs_lists_scheduled_stories_under_way_stopped_first() {
    let fx = setup("internal").await;
    let ready = story(&fx, "ready in a sprint").await;
    ready_in_sprint(&fx, &ready).await;
    let unscheduled = story(&fx, "ready, no sprint").await;
    sized(&fx, &unscheduled).await;
    mv(&fx, &unscheduled, "refining").await.unwrap();
    mv(&fx, &unscheduled, "ready").await.unwrap();
    story(&fx, "still in backlog").await;
    let stopped = story(&fx, "stopped").await;
    subtask(&fx, &stopped, true).await;
    ready_in_sprint(&fx, &stopped).await;
    mv(&fx, &stopped, "building").await.unwrap();
    ops::run_stop(&fx.pool, &stopped, "Verify failed twice", Actor::Agent).await.unwrap();
    // A legacy project's Story never shows, whatever its status.
    sqlx::query(
        r#"INSERT INTO tasks (project_id, sprint_id, title, type, status, created_at, updated_at, task_number)
           VALUES ((SELECT id FROM projects WHERE key = 'LG'), ?, 'legacy', 'story', 'ready', '', '', 1)"#,
    )
    .bind(fx.sprint)
    .execute(&fx.pool)
    .await
    .unwrap();

    let runs = ops::active_runs(&fx.pool).await.unwrap();
    let runs = runs.as_array().unwrap();
    let keys: Vec<&str> = runs.iter().map(|r| r["key"].as_str().unwrap()).collect();
    assert_eq!(keys, vec![stopped.as_str(), ready.as_str()]);

    let first = &runs[0];
    assert_eq!(first["status"], "building");
    assert_eq!(first["flags"]["stopped"], true);
    assert_eq!(first["flags"]["waiting_on_bugs"], 1);
    assert_eq!(first["needs_pedro"], true, "a stopped Run is Pedro's move");
    assert_eq!(first["assignee"], "Pedro");
    assert_eq!(first["project"], "SF");
    assert!(!first["stage_entered_at"].as_str().unwrap().is_empty());
    assert_eq!(runs[1]["flags"]["stopped"], false);
}

async fn points(fx: &Fx, key: &str) -> i64 {
    let n: i64 = key.rsplit_once('-').unwrap().1.parse().unwrap();
    sqlx::query_scalar("SELECT story_points FROM tasks WHERE task_number = ? AND project_id = (SELECT id FROM projects WHERE key = 'SF')")
        .bind(n)
        .fetch_one(&fx.pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn a_storys_points_are_the_sum_of_its_subtasks_without_bugs_or_canceled_ones() {
    let fx = setup("internal").await;
    let s = story(&fx, "sized").await;
    assert_eq!(points(&fx, &s).await, 0);
    let a = subtask(&fx, &s, false).await;
    subtask(&fx, &s, false).await;
    assert_eq!(points(&fx, &s).await, 4);

    subtask(&fx, &s, true).await;
    assert_eq!(points(&fx, &s).await, 4, "a bug Subtask doesn't count");

    ops::subtask_move(&fx.pool, &a, "canceled", Actor::Owner).await.unwrap();
    assert_eq!(points(&fx, &s).await, 2, "a canceled Subtask doesn't count");
    ops::subtask_move(&fx.pool, &a, "todo", Actor::Owner).await.unwrap();
    assert_eq!(points(&fx, &s).await, 4, "a reopened Subtask counts again");
}

#[tokio::test]
async fn an_unsplit_story_cannot_move_to_ready() {
    let fx = setup("internal").await;
    let s = story(&fx, "unsplit").await;
    mv(&fx, &s, "refining").await.unwrap();
    let err = mv(&fx, &s, "ready").await.unwrap_err();
    assert!(err.contains("0 points"), "{err}");
    subtask(&fx, &s, false).await;
    mv(&fx, &s, "ready").await.unwrap();
}

// ─── Bug Stories (FB-52) ────────────────────────────────────────────────────

use crate::test_support::{self as ts, SprintStatus, TaskStatus, TaskType};

/// The issue key of task `id`.
async fn key_of(pool: &SqlitePool, id: i64) -> String {
    sqlx::query_scalar("SELECT p.key || '-' || t.task_number FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn points_of(pool: &SqlitePool, id: i64) -> i64 {
    sqlx::query_scalar("SELECT story_points FROM tasks WHERE id = ?").bind(id).fetch_one(pool).await.unwrap()
}

/// A Client Factory project SF with a primary contact and an active sprint, and
/// a top-level `bug` in backlog on it. Returns the pool, the sprint, and the
/// bug's id and key.
async fn bug_story_fixture() -> (SqlitePool, i64, i64, String) {
    let pool = ts::pool().await;
    let p = ts::factory_project(&pool, "SF").await;
    ops::project_set(&pool, "SF", None, Some("client")).await.unwrap();
    let client: i64 = sqlx::query_scalar("INSERT INTO people (name, email) VALUES ('Client', 'client@test') RETURNING id")
        .fetch_one(&pool)
        .await
        .unwrap();
    ops::contact_add(&pool, "SF", client, true).await.unwrap();
    let sprint = ts::sprint(&pool, p, "S1", "2026-10-01", SprintStatus::Active).await;
    let bug = ts::task(&pool, p, None, None, TaskType::Bug, TaskStatus::Backlog).await;
    let key = key_of(&pool, bug).await;
    (pool, sprint, bug, key)
}

async fn new_subtask(pool: &SqlitePool, story: &str, bug: bool, story_points: i64) -> String {
    let s = ops::subtask_create(
        pool,
        NewSubtask { story, title: "slice", description: "", bug, story_points, risk: false },
        Actor::Agent,
    )
    .await
    .unwrap();
    s["key"].as_str().unwrap().to_string()
}

/// The `active_runs` entry for `key`, if it is listed.
async fn active_run(pool: &SqlitePool, key: &str) -> Option<Value> {
    ops::active_runs(pool).await.unwrap().as_array().unwrap().iter().find(|r| r["key"] == key).cloned()
}

#[tokio::test]
async fn a_top_level_bug_climbs_the_whole_story_ladder() {
    let (pool, sprint, bug, s) = bug_story_fixture().await;
    let mv = |to: &'static str| ops::story_move(&pool, &s, to, Actor::Owner);

    mv("refining").await.unwrap();
    let sub = new_subtask(&pool, &s, false, 2).await;
    let dropped = new_subtask(&pool, &s, false, 3).await;
    ops::subtask_move(&pool, &dropped, "canceled", Actor::Owner).await.unwrap();
    assert_eq!(points_of(&pool, bug).await, 2, "points are the sum of the open non-bug Subtasks");
    let err = ops::app_check_points(&pool, bug, Some(8)).await.unwrap_err();
    assert!(err.contains("sum of its Subtasks' points"), "{err}");
    ops::app_check_points(&pool, bug, Some(2)).await.expect("echoing the current points is not an edit");

    mv("ready").await.unwrap();
    ops::story_set_sprint(&pool, &s, Some(sprint)).await.unwrap();
    mv("building").await.unwrap();
    let run = active_run(&pool, &s).await.expect("a bug Story under way is an active Run");
    assert_eq!(run["flags"]["waiting_on_bugs"], 0, "an open non-bug Subtask is not a bug");

    ops::subtask_handoff(&pool, &sub, "backend-engineer", "claude-opus-5-5", Actor::Agent).await.unwrap();
    ops::subtask_move(&pool, &sub, "in_progress", Actor::Agent).await.unwrap();
    ops::subtask_move(&pool, &sub, "done", Actor::Agent).await.unwrap();
    ops::subtask_verify(&pool, &sub, true, "gates green", Actor::Agent).await.unwrap();
    mv("integrated_tests").await.unwrap();

    // A defect found while testing the fix is a bug Subtask, and holds it.
    let found = new_subtask(&pool, &s, true, 5).await;
    assert_eq!(points_of(&pool, bug).await, 2, "a bug Subtask doesn't count");
    assert_eq!(active_run(&pool, &s).await.unwrap()["flags"]["waiting_on_bugs"], 1);
    assert_eq!(ops::story_show(&pool, &s).await.unwrap()["flags"]["waiting_on_bugs"], 1);
    assert!(mv("tested").await.is_err());
    mv("building").await.unwrap();
    ops::subtask_move(&pool, &found, "in_progress", Actor::Agent).await.unwrap();
    ops::subtask_move(&pool, &found, "done", Actor::Agent).await.unwrap();
    mv("integrated_tests").await.unwrap();
    mv("tested").await.unwrap();

    ops::release_create(&pool, "SF", "1.0.0").await.unwrap();
    ops::release_pick(&pool, "1.0.0", &s, Actor::Owner).await.unwrap();
    mv("user_testing").await.unwrap();
    let done = mv("done").await.unwrap();
    assert_eq!(done["status"], "done");
    assert_eq!(done["release"]["version"], "1.0.0");
}

#[tokio::test]
async fn story_and_subtask_operations_refuse_the_other_level_of_bug() {
    let (pool, _, _, s) = bug_story_fixture().await;
    ops::story_move(&pool, &s, "refining", Actor::Owner).await.unwrap();
    let bug_sub = new_subtask(&pool, &s, true, 1).await;

    let errs = [
        ops::subtask_move(&pool, &s, "in_progress", Actor::Agent).await.unwrap_err(),
        ops::subtask_handoff(&pool, &s, "implementer", "m", Actor::Agent).await.unwrap_err(),
        ops::subtask_verify(&pool, &s, true, "", Actor::Agent).await.unwrap_err(),
    ];
    for err in errs {
        assert!(err.contains("is not a Subtask"), "a top-level bug is a Story: {err}");
    }
    let errs = [
        ops::story_move(&pool, &bug_sub, "refining", Actor::Owner).await.unwrap_err(),
        ops::story_show(&pool, &bug_sub).await.unwrap_err(),
    ];
    for err in errs {
        assert!(err.contains("is not a Story"), "a bug with a parent is a Subtask: {err}");
    }
}

#[tokio::test]
async fn the_app_moves_a_bug_story_through_the_story_operations() {
    let (pool, sprint, bug, s) = bug_story_fixture().await;
    ops::story_move(&pool, &s, "refining", Actor::Owner).await.unwrap();
    let sub = new_subtask(&pool, &s, false, 2).await;

    assert!(ops::app_move(&pool, bug, Some("ready"), None).await.unwrap());
    let shown = ops::story_show(&pool, &s).await.unwrap();
    assert_eq!(shown["status"], "ready");
    assert_eq!(shown["assignee"], "Pedro", "story_move applied the assignee rule");

    assert!(ops::app_move(&pool, bug, None, Some(Some(sprint))).await.unwrap());
    assert_eq!(ops::story_show(&pool, &s).await.unwrap()["sprint_id"], sprint);
    let sub_sprint: Option<i64> = sqlx::query_scalar(
        "SELECT sprint_id FROM tasks WHERE task_number = ? AND project_id = (SELECT id FROM projects WHERE key = 'SF')",
    )
    .bind(sub.rsplit_once('-').unwrap().1.parse::<i64>().unwrap())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(sub_sprint, Some(sprint), "story_set_sprint carried the Subtask along");

    let err = ops::app_move(&pool, bug, Some("refining"), Some(None)).await.unwrap_err();
    assert!(err.contains("separately"), "{err}");
}

#[tokio::test]
async fn a_legacy_top_level_bug_keeps_its_editable_points_and_app_path() {
    let pool = ts::pool().await;
    let p = ts::project(&pool, "LG").await;
    let bug = ts::task(&pool, p, None, None, TaskType::Bug, TaskStatus::Todo).await;
    ops::app_check_points(&pool, bug, Some(8)).await.expect("a legacy bug's points are its own");
    assert!(!ops::app_move(&pool, bug, Some("in_progress"), None).await.unwrap(), "legacy rows skip the Factory ladder");
    ops::app_check_level(&pool, bug, Some(Some(bug + 1)), None).await.expect("legacy parents are free");
    ops::app_check_level(&pool, bug, None, Some("subtask")).await.expect("legacy types are free");
}

async fn bug_story(fx: &Fx, title: &str) -> Value {
    ops::story_create(
        &fx.pool,
        NewStory { project: "SF", title, description: "", priority: "medium", labels: "", bug: true },
        Actor::Owner,
    )
    .await
    .unwrap()
}

#[tokio::test]
async fn story_create_files_a_bug_story_with_the_bug_flag() {
    let fx = setup("internal").await;
    let created = bug_story(&fx, "a fix").await;
    assert_eq!((&created["type"], &created["status"], &created["assignee"]), (&"bug".into(), &"backlog".into(), &"Pedro".into()));
    let key = created["key"].as_str().unwrap();
    let n: i64 = key.rsplit_once('-').unwrap().1.parse().unwrap();
    let stored: (String, Option<i64>, String, Option<i64>) = sqlx::query_as(
        "SELECT type, parent_id, status, assignee_id FROM tasks WHERE task_number = ? AND project_id = (SELECT id FROM projects WHERE key = 'SF')",
    )
    .bind(n)
    .fetch_one(&fx.pool)
    .await
    .unwrap();
    assert_eq!(stored, ("bug".into(), None, "backlog".into(), Some(fx.pedro)));

    let feature = story(&fx, "a feature").await;
    assert_eq!(ops::story_show(&fx.pool, &feature).await.unwrap()["type"], "story", "without the flag it is a Story");
}

#[tokio::test]
async fn release_show_gives_each_picked_storys_type() {
    let fx = setup("internal").await;
    let feature = tested(&fx, "feature").await;
    let fix = bug_story(&fx, "fix").await["key"].as_str().unwrap().to_string();
    ready_in_sprint(&fx, &fix).await;
    for to in ["building", "integrated_tests", "tested"] {
        mv(&fx, &fix, to).await.unwrap();
    }
    ops::release_create(&fx.pool, "SF", "1.6.0").await.unwrap();
    for k in [&feature, &fix] {
        ops::release_pick(&fx.pool, "1.6.0", k, Actor::Owner).await.unwrap();
    }

    let shown = ops::release_show(&fx.pool, "SF", "1.6.0").await.unwrap();
    let types: Vec<(&str, &str)> = shown["stories"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| (s["key"].as_str().unwrap(), s["type"].as_str().unwrap()))
        .collect();
    assert_eq!(types, vec![(feature.as_str(), "story"), (fix.as_str(), "bug")]);
}

// ─── Epics (FB-224) ─────────────────────────────────────────────────────────

/// A Factory project SF with an open epic created through `ops::epic_create`;
/// returns the pool, the project id and the epic's key.
async fn epic_fixture() -> (SqlitePool, i64, String) {
    let pool = ts::pool().await;
    let p = ts::factory_project(&pool, "SF").await;
    let epic = ops::epic_create(
        &pool,
        ops::NewEpic { project: "SF", title: "hosted web app", description: "", priority: "medium", labels: "" },
        Actor::Agent,
    )
    .await
    .unwrap();
    (pool, p, epic["key"].as_str().unwrap().to_string())
}

/// The stored type, status, parent, sprint and points of the task `key` on SF.
async fn stored(pool: &SqlitePool, key: &str) -> (String, String, Option<i64>, Option<i64>, i64) {
    let n: i64 = key.rsplit_once('-').unwrap().1.parse().unwrap();
    sqlx::query_as(
        r#"SELECT type, status, parent_id, sprint_id, story_points FROM tasks
            WHERE task_number = ? AND project_id = (SELECT id FROM projects WHERE key = 'SF')"#,
    )
    .bind(n)
    .fetch_one(pool)
    .await
    .unwrap()
}

#[tokio::test]
async fn epic_create_opens_an_epic_at_todo_with_no_sprint_or_points() {
    let (pool, _, key) = epic_fixture().await;
    assert_eq!(stored(&pool, &key).await, ("epic".into(), "todo".into(), None, None, 0));
}

#[tokio::test]
async fn epic_create_is_refused_on_a_legacy_project() {
    let pool = ts::pool().await;
    ts::project(&pool, "LG").await;
    ops::people_set_role(&pool, ts::OWNER, Some("owner")).await.unwrap();
    ops::people_set_role(&pool, ts::AGENT, Some("agent")).await.unwrap();
    let err = ops::epic_create(
        &pool,
        ops::NewEpic { project: "LG", title: "x", description: "", priority: "medium", labels: "" },
        Actor::Agent,
    )
    .await
    .unwrap_err();
    assert!(err.contains("legacy project"), "{err}");
}

#[tokio::test]
async fn epic_move_closes_or_cancels_an_open_epic_and_nothing_else() {
    for to in ["done", "canceled"] {
        let (pool, _, key) = epic_fixture().await;
        for refused in ["backlog", "refining", "ready", "building", "tested", "in_progress", "todo"] {
            let err = ops::epic_move(&pool, &key, refused, Actor::Owner).await.unwrap_err();
            assert!(err.contains(&key) && err.contains(&format!("from todo to {refused}")), "todo -> {refused}: {err}");
            assert_eq!(stored(&pool, &key).await.1, "todo", "a refused move changes nothing");
        }
        let moved = ops::epic_move(&pool, &key, to, Actor::Owner).await.unwrap();
        assert_eq!(moved["status"], to);
        assert_eq!(stored(&pool, &key).await.1, to);

        // Closed is final: no reopen, no switch between done and canceled.
        for refused in ["todo", "done", "canceled", "backlog"] {
            let err = ops::epic_move(&pool, &key, refused, Actor::Owner).await.unwrap_err();
            assert!(err.contains(&key) && err.contains(&format!("from {to} to {refused}")), "{to} -> {refused}: {err}");
            assert_eq!(stored(&pool, &key).await.1, to);
        }
    }
}

#[tokio::test]
async fn epic_move_logs_the_change_on_the_epic() {
    let (pool, _, key) = epic_fixture().await;
    ops::epic_move(&pool, &key, "done", Actor::Owner).await.unwrap();
    let n: i64 = key.rsplit_once('-').unwrap().1.parse().unwrap();
    let events: Vec<(String, String, String)> = sqlx::query_as(
        r#"SELECT a.action, a.old_value, a.new_value FROM activity_log a JOIN tasks t ON t.id = a.task_id
            WHERE t.task_number = ? ORDER BY a.id"#,
    )
    .bind(n)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        events,
        vec![("created".into(), "".into(), "todo".into()), ("status_changed".into(), "todo".into(), "done".into())]
    );
}

#[tokio::test]
async fn epic_move_refuses_a_story() {
    let (pool, p, _) = epic_fixture().await;
    let story = ts::task(&pool, p, None, None, TaskType::Story, TaskStatus::Backlog).await;
    let err = ops::epic_move(&pool, &key_of(&pool, story).await, "done", Actor::Owner).await.unwrap_err();
    assert!(err.contains("is not an epic"), "{err}");
}

#[tokio::test]
async fn story_operations_refuse_an_epic() {
    let (pool, _, key) = epic_fixture().await;
    ops::release_create(&pool, "SF", "1.0.0").await.unwrap();
    let errs = [
        ops::story_move(&pool, &key, "refining", Actor::Owner).await.unwrap_err(),
        ops::story_show(&pool, &key).await.unwrap_err(),
        ops::release_pick(&pool, "1.0.0", &key, Actor::Owner).await.unwrap_err(),
    ];
    for err in errs {
        assert!(err.contains("is not a Story"), "{err}");
    }
    assert_eq!(stored(&pool, &key).await.1, "todo");
}

#[tokio::test]
async fn subtask_create_refuses_an_epic_as_its_story() {
    let (pool, _, key) = epic_fixture().await;
    let err = ops::subtask_create(
        &pool,
        NewSubtask { story: &key, title: "s", description: "", bug: false, story_points: 1, risk: false },
        Actor::Agent,
    )
    .await
    .unwrap_err();
    assert!(err.contains("is not a Story"), "{err}");
}

#[tokio::test]
async fn the_app_moves_a_factory_epic_through_epic_move() {
    let (pool, _, key) = epic_fixture().await;
    let n: i64 = key.rsplit_once('-').unwrap().1.parse().unwrap();
    let id: i64 = sqlx::query_scalar("SELECT id FROM tasks WHERE task_number = ?").bind(n).fetch_one(&pool).await.unwrap();
    let err = ops::app_move(&pool, id, Some("building"), None).await.unwrap_err();
    assert!(err.contains(&key) && err.contains("from todo to building"), "{err}");
    assert!(ops::app_move(&pool, id, Some("canceled"), None).await.unwrap());
    assert_eq!(stored(&pool, &key).await.1, "canceled");
}

#[tokio::test]
async fn epic_move_refuses_a_legacy_epic_and_an_unknown_target() {
    let pool = ts::pool().await;
    let lg = ts::project(&pool, "LG").await;
    let legacy = ts::task(&pool, lg, None, None, TaskType::Epic, TaskStatus::Todo).await;
    let legacy_key = key_of(&pool, legacy).await;
    let err = ops::epic_move(&pool, &legacy_key, "done", Actor::Owner).await.unwrap_err();
    assert!(err.contains("legacy project"), "{err}");
    let status: String = sqlx::query_scalar("SELECT status FROM tasks WHERE id = ?").bind(legacy).fetch_one(&pool).await.unwrap();
    assert_eq!(status, "todo", "a legacy epic is left alone");

    let (pool, _, key) = epic_fixture().await;
    let err = ops::epic_move(&pool, &key, "bogus", Actor::Owner).await.unwrap_err();
    assert!(err.contains(&key) && err.contains("from todo to bogus") && err.contains("not an epic status"), "{err}");
    assert_eq!(stored(&pool, &key).await.1, "todo");
}

// ─── Epic reads (FB-292) ────────────────────────────────────────────────────

#[tokio::test]
async fn epic_show_returns_the_epic_and_its_stories_by_task_number() {
    let pool = ts::pool().await;
    let p = ts::factory_project(&pool, "SF").await;
    let epic = ops::epic_create(
        &pool,
        ops::NewEpic { project: "SF", title: "hosted web app", description: "the goal", priority: "medium", labels: "" },
        Actor::Agent,
    )
    .await
    .unwrap();
    let key = epic["key"].as_str().unwrap().to_string();
    let epic_id: i64 = sqlx::query_scalar("SELECT id FROM tasks WHERE type = 'epic'").fetch_one(&pool).await.unwrap();
    let other_epic = ts::task(&pool, p, None, None, TaskType::Epic, TaskStatus::Todo).await;
    let story = ts::task(&pool, p, None, None, TaskType::Story, TaskStatus::Backlog).await;
    let bug_story = ts::task(&pool, p, None, None, TaskType::Bug, TaskStatus::Canceled).await;
    let sub = ts::task(&pool, p, None, Some(story), TaskType::Subtask, TaskStatus::Todo).await;
    let elsewhere = ts::task(&pool, p, None, None, TaskType::Story, TaskStatus::Backlog).await;
    // Linked in reverse so the order comes from the task number, not the link.
    link(&pool, bug_story, epic_id).await;
    link(&pool, story, epic_id).await;
    link(&pool, sub, epic_id).await; // not Story-level: never listed
    link(&pool, elsewhere, other_epic).await;

    let shown = ops::epic_show(&pool, &key).await.unwrap();
    assert_eq!(
        shown,
        serde_json::json!({
            "key": key,
            "title": "hosted web app",
            "status": "todo",
            "description": "the goal",
            "stories": [
                { "key": key_of(&pool, story).await, "title": "t", "type": "story", "status": "backlog" },
                { "key": key_of(&pool, bug_story).await, "title": "t", "type": "bug", "status": "canceled" },
            ],
        })
    );
}

#[tokio::test]
async fn epic_show_refuses_an_unknown_key_a_story_and_a_legacy_epic() {
    let (pool, p, _) = epic_fixture().await;
    let story = ts::task(&pool, p, None, None, TaskType::Story, TaskStatus::Backlog).await;
    let lg = ts::project(&pool, "LG").await;
    let legacy = ts::task(&pool, lg, None, None, TaskType::Epic, TaskStatus::Todo).await;
    let cases = [
        ("SF-99".to_string(), "SF-99 not found"),
        (key_of(&pool, story).await, "is not an epic"),
        (key_of(&pool, legacy).await, "legacy project"),
    ];
    for (key, needle) in cases {
        let err = ops::epic_show(&pool, &key).await.unwrap_err();
        assert!(err.contains(needle), "{needle}: {err}");
    }
}

#[tokio::test]
async fn epic_list_filters_by_status_and_counts_stories_by_status() {
    let pool = ts::pool().await;
    let p = ts::factory_project(&pool, "SF").await;
    let open = ts::task(&pool, p, None, None, TaskType::Epic, TaskStatus::Todo).await;
    let empty = ts::task(&pool, p, None, None, TaskType::Epic, TaskStatus::Todo).await;
    let done = ts::task(&pool, p, None, None, TaskType::Epic, TaskStatus::Done).await;
    let canceled = ts::task(&pool, p, None, None, TaskType::Epic, TaskStatus::Canceled).await;
    for (status, kind) in [
        (TaskStatus::Backlog, TaskType::Story),
        (TaskStatus::Building, TaskType::Story),
        (TaskStatus::Building, TaskType::Bug),
        (TaskStatus::Canceled, TaskType::Story),
    ] {
        let id = ts::task(&pool, p, None, None, kind, status).await;
        link(&pool, id, open).await;
    }
    let host = ts::task(&pool, p, None, None, TaskType::Story, TaskStatus::Done).await;
    link(&pool, host, done).await;
    // A Subtask carrying the epic is not Story-level: never counted.
    let sub = ts::task(&pool, p, None, Some(host), TaskType::Subtask, TaskStatus::Todo).await;
    link(&pool, sub, done).await;

    let k = |id: i64| {
        let pool = pool.clone();
        async move { key_of(&pool, id).await }
    };
    let entry = |key: String, status: &str, stories: Value| serde_json::json!({ "key": key, "title": "t", "status": status, "stories": stories });
    let open_entry = entry(k(open).await, "todo", serde_json::json!({ "backlog": 1, "building": 2, "canceled": 1 }));
    let empty_entry = entry(k(empty).await, "todo", serde_json::json!({}));
    let done_entry = entry(k(done).await, "done", serde_json::json!({ "done": 1 }));
    let canceled_entry = entry(k(canceled).await, "canceled", serde_json::json!({}));

    let listed = |status: Option<&'static str>| {
        let pool = pool.clone();
        async move { ops::epic_list(&pool, "sf", status).await.unwrap() }
    };
    let todo = listed(None).await;
    assert_eq!(todo["project"], "SF");
    assert_eq!(todo["epics"], serde_json::json!([open_entry, empty_entry]), "no status lists the open epics");
    assert_eq!(listed(Some("todo")).await["epics"], todo["epics"]);
    assert_eq!(listed(Some("done")).await["epics"], serde_json::json!([done_entry]));
    assert_eq!(listed(Some("canceled")).await["epics"], serde_json::json!([canceled_entry]));
    assert_eq!(
        listed(Some("all")).await["epics"],
        serde_json::json!([open_entry, empty_entry, done_entry, canceled_entry])
    );
}

#[tokio::test]
async fn epic_list_refuses_a_bad_status_an_unknown_project_and_a_legacy_project() {
    let (pool, _, _) = epic_fixture().await;
    ts::project(&pool, "LG").await;
    let err = ops::epic_list(&pool, "SF", Some("open")).await.unwrap_err();
    assert!(err.contains("'open'") && err.contains("todo, done, canceled, all"), "{err}");
    let err = ops::epic_list(&pool, "ZZ", None).await.unwrap_err();
    assert!(err.contains("project ZZ not found"), "{err}");
    let err = ops::epic_list(&pool, "LG", None).await.unwrap_err();
    assert!(err.contains("legacy project"), "{err}");
}

// ─── Epic membership (FB-224) ───────────────────────────────────────────────

/// A `story_edit` that only sets the epic (`None` takes the Story out).
fn set_epic(epic: Option<&str>) -> ops::StoryEdit<'_> {
    ops::StoryEdit { title: None, description: None, priority: None, labels: None, epic: Some(epic) }
}

async fn epic_of(pool: &SqlitePool, id: i64) -> Option<i64> {
    sqlx::query_scalar("SELECT epic_id FROM tasks WHERE id = ?").bind(id).fetch_one(pool).await.unwrap()
}

async fn link(pool: &SqlitePool, id: i64, epic: i64) {
    sqlx::query("UPDATE tasks SET epic_id = ? WHERE id = ?").bind(epic).bind(id).execute(pool).await.unwrap();
}

#[tokio::test]
async fn a_story_and_a_bug_story_join_an_open_epic_and_leave_it_through_story_edit() {
    let pool = ts::pool().await;
    let p = ts::factory_project(&pool, "SF").await;
    let epic = ts::task(&pool, p, None, None, TaskType::Epic, TaskStatus::Todo).await;
    let epic_key = key_of(&pool, epic).await;
    let story = ts::task(&pool, p, None, None, TaskType::Story, TaskStatus::Backlog).await;
    let bug_story = ts::task(&pool, p, None, None, TaskType::Bug, TaskStatus::Building).await;
    for id in [story, bug_story] {
        let key = key_of(&pool, id).await;
        let out = ops::story_edit(&pool, &key, set_epic(Some(&epic_key))).await.unwrap();
        assert_eq!(out["epic"], serde_json::json!({ "key": epic_key, "title": "t", "status": "todo" }));
        assert_eq!(epic_of(&pool, id).await, Some(epic));

        // An edit that leaves the epic out keeps it.
        let edit = ops::StoryEdit { title: Some("renamed"), description: None, priority: None, labels: None, epic: None };
        ops::story_edit(&pool, &key, edit).await.unwrap();
        assert_eq!(epic_of(&pool, id).await, Some(epic));

        let out = ops::story_edit(&pool, &key, set_epic(None)).await.unwrap();
        assert_eq!(out["epic"], Value::Null);
        assert_eq!(epic_of(&pool, id).await, None);
    }
}

#[tokio::test]
async fn story_show_names_the_storys_epic_or_null() {
    let pool = ts::pool().await;
    let p = ts::factory_project(&pool, "SF").await;
    let epic = ts::task(&pool, p, None, None, TaskType::Epic, TaskStatus::Todo).await;
    let linked = ts::task(&pool, p, None, None, TaskType::Story, TaskStatus::Refining).await;
    let alone = ts::task(&pool, p, None, None, TaskType::Story, TaskStatus::Refining).await;
    link(&pool, linked, epic).await;
    // A closed epic is still shown on the Stories it holds.
    sqlx::query("UPDATE tasks SET status = 'done' WHERE id = ?").bind(epic).execute(&pool).await.unwrap();

    let shown = ops::story_show(&pool, &key_of(&pool, linked).await).await.unwrap();
    assert_eq!(shown["epic"], serde_json::json!({ "key": key_of(&pool, epic).await, "title": "t", "status": "done" }));
    let shown = ops::story_show(&pool, &key_of(&pool, alone).await).await.unwrap();
    assert!(shown["epic"].is_null(), "{shown}");
}

#[tokio::test]
async fn story_edit_refuses_an_epic_change_that_breaks_membership_and_changes_nothing() {
    let pool = ts::pool().await;
    let p = ts::factory_project(&pool, "SF").await;
    let other = ts::factory_project(&pool, "OT").await;
    let lg = ts::project(&pool, "LG").await;
    let open = ts::task(&pool, p, None, None, TaskType::Epic, TaskStatus::Todo).await;
    let done_epic = ts::task(&pool, p, None, None, TaskType::Epic, TaskStatus::Done).await;
    let canceled_epic = ts::task(&pool, p, None, None, TaskType::Epic, TaskStatus::Canceled).await;
    let foreign = ts::task(&pool, other, None, None, TaskType::Epic, TaskStatus::Todo).await;
    let story = ts::task(&pool, p, None, None, TaskType::Story, TaskStatus::Ready).await;
    let not_epic = ts::task(&pool, p, None, None, TaskType::Story, TaskStatus::Backlog).await;
    let sub = ts::task(&pool, p, None, Some(story), TaskType::Subtask, TaskStatus::Todo).await;
    let done_story = ts::task(&pool, p, None, None, TaskType::Story, TaskStatus::Done).await;
    let canceled_story = ts::task(&pool, p, None, None, TaskType::Bug, TaskStatus::Canceled).await;
    let legacy_story = ts::task(&pool, lg, None, None, TaskType::Story, TaskStatus::Todo).await;
    link(&pool, done_story, open).await;
    link(&pool, canceled_story, open).await;

    let k = |id: i64| {
        let pool = pool.clone();
        async move { key_of(&pool, id).await }
    };
    let cases: Vec<(i64, Option<String>, &str)> = vec![
        (story, Some(k(foreign).await), "belongs to another project"),
        (story, Some(k(done_epic).await), "is done; a closed epic takes no new Stories"),
        (story, Some(k(canceled_epic).await), "is canceled; a closed epic takes no new Stories"),
        (story, Some(k(not_epic).await), "is not an epic"),
        (story, Some("SF-99".into()), "SF-99 not found"),
        (done_story, None, "is done; a done or canceled Story keeps its epic"),
        (done_story, Some(k(not_epic).await), "keeps its epic"),
        (canceled_story, None, "is canceled; a done or canceled Story keeps its epic"),
        (sub, Some(k(open).await), "is not a Story"),
        (open, None, "is not a Story"),
        (open, Some(k(done_epic).await), "is not a Story"),
        (legacy_story, Some(k(open).await), "legacy project"),
    ];
    let row = |id: i64| {
        let pool = pool.clone();
        async move {
            sqlx::query_as::<_, (Option<i64>, String, String)>("SELECT epic_id, title, updated_at FROM tasks WHERE id = ?")
                .bind(id)
                .fetch_one(&pool)
                .await
                .unwrap()
        }
    };
    for (id, epic, needle) in cases {
        let before = row(id).await;
        // A refused epic change takes the rest of the edit down with it.
        let edit = ops::StoryEdit { title: Some("renamed"), ..set_epic(epic.as_deref()) };
        let err = ops::story_edit(&pool, &k(id).await, edit).await.unwrap_err();
        assert!(err.contains(needle), "{needle}: {err}");
        assert_eq!(row(id).await, before, "{needle}: nothing changes");
    }
    // Keeping a done Story's epic is not a change.
    ops::story_edit(&pool, &k(done_story).await, set_epic(Some(&k(open).await))).await.unwrap();
}
