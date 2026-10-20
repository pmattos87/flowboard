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
        NewStory { project: "SF", title, description: "", priority: "medium", labels: "" },
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

/// Take a Story to `ready` and into the sprint.
async fn ready_in_sprint(fx: &Fx, key: &str) {
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
        NewStory { project: "LG", title: "x", description: "", priority: "medium", labels: "" },
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
    assert!(ops::release_move(&fx.pool, "SF", "1.6.0", "user_testing").await.is_err());
    ops::release_move(&fx.pool, "SF", "1.6.0", "released").await.unwrap();
    assert!(ops::release_create(&fx.pool, "SF", "1.6").await.is_err());
}

#[tokio::test]
async fn missing_factory_roles_give_an_actionable_error() {
    let fx = setup("internal").await;
    ops::people_set_role(&fx.pool, fx.pedro, None).await.unwrap();
    let err = ops::story_create(
        &fx.pool,
        NewStory { project: "SF", title: "x", description: "", priority: "medium", labels: "" },
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
