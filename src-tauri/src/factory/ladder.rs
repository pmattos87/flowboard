//! The Factory ladders as pure rules: which moves are legal and who owns the
//! Story afterwards. No database access here; `ops` loads the facts and asks.

pub const STORY_STATUSES: &[&str] = &[
    "backlog",
    "refining",
    "ready",
    "building",
    "integrated_tests",
    "tested",
    "user_testing",
    "done",
    "canceled",
];

pub const SUBTASK_STATUSES: &[&str] = &["todo", "in_progress", "done", "canceled"];

pub const RELEASE_STATES: &[&str] = &["planned", "user_testing", "released", "canceled"];

/// Whose move it is once a Story enters a status.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Owner {
    Pedro,
    Agent,
    ClientContact,
    Nobody,
}

pub fn story_owner(status: &str) -> Owner {
    match status {
        "building" => Owner::Agent,
        "user_testing" => Owner::ClientContact,
        "done" | "canceled" => Owner::Nobody,
        _ => Owner::Pedro,
    }
}

/// Everything about a Story that decides whether it may move.
#[derive(Debug, Clone)]
pub struct StoryFacts<'a> {
    pub status: &'a str,
    pub in_sprint: bool,
    pub client_project: bool,
    pub open_subtasks: i64,
    pub run_stopped: bool,
    /// The sum of its Subtasks' points (SF-68); 0 until it is split.
    pub story_points: i64,
}

fn rank(status: &str) -> Option<usize> {
    STORY_STATUSES[..7].iter().position(|s| *s == status)
}

/// The moves the ladder draws, ignoring guards.
fn story_edge(from: &str, to: &str) -> bool {
    if to == "canceled" {
        return !matches!(from, "done" | "canceled");
    }
    // Recovery: a Story stranded on a status off the ladder (a legacy status
    // written before the project switched, or by an old app build) re-enters it
    // at a Pedro-owned stage.
    if !STORY_STATUSES.contains(&from) {
        return matches!(to, "backlog" | "refining" | "ready");
    }
    matches!(
        (from, to),
        ("backlog", "refining")
            | ("refining", "backlog")
            | ("refining", "ready")
            | ("ready", "refining")
            | ("ready", "building")
            | ("building", "integrated_tests")
            | ("integrated_tests", "building")
            | ("integrated_tests", "tested")
            | ("tested", "building")
            | ("tested", "user_testing")
            | ("tested", "done")
            | ("user_testing", "building")
            | ("user_testing", "done")
            | ("canceled", "backlog")
            | ("canceled", "refining")
            | ("canceled", "ready")
    )
}

/// `Ok(())` when the Story may move to `to`; otherwise the reason it may not.
pub fn check_story_move(facts: &StoryFacts, to: &str) -> Result<(), String> {
    let from = facts.status;
    if !STORY_STATUSES.contains(&to) {
        return Err(format!(
            "'{to}' is not a Story status (expected one of: {})",
            STORY_STATUSES.join(", ")
        ));
    }
    if from == to {
        return Err(format!("the Story is already {to}"));
    }
    if !story_edge(from, to) {
        return Err(format!("a Story cannot move from {from} to {to}"));
    }
    if to == "canceled" {
        return Ok(());
    }
    if matches!(to, "backlog" | "refining") && facts.in_sprint {
        return Err(format!(
            "a Story in a sprint cannot go back to {to}; remove it from the sprint first"
        ));
    }
    if from == "refining" && to == "ready" && facts.story_points == 0 {
        return Err("the Story has 0 points; split it into Subtasks first (factory:split)".into());
    }
    if to == "building" && !facts.in_sprint {
        return Err("a Run can only start on a Story that is in a sprint".into());
    }
    let forward = matches!((rank(from), rank(to)), (Some(f), Some(t)) if t > f) || to == "done";
    if forward && from != "ready" && from != "backlog" && from != "refining" {
        if facts.run_stopped {
            return Err("the Run is stopped; restart it before moving the Story forward".into());
        }
        if facts.open_subtasks > 0 {
            return Err(format!(
                "the Story has {} open Subtask(s); all must be done or canceled first",
                facts.open_subtasks
            ));
        }
    }
    if to == "user_testing" && !facts.client_project {
        return Err("user_testing exists only on Client projects".into());
    }
    if from == "tested" && to == "done" && facts.client_project {
        return Err("on a Client project a tested Story goes to user_testing before done".into());
    }
    Ok(())
}

pub fn check_subtask_move(from: &str, to: &str) -> Result<(), String> {
    if !SUBTASK_STATUSES.contains(&to) {
        return Err(format!(
            "'{to}' is not a Subtask status (expected one of: {})",
            SUBTASK_STATUSES.join(", ")
        ));
    }
    if from == to {
        return Err(format!("the Subtask is already {to}"));
    }
    // Recovery, as for Stories: off the ladder, a Subtask re-enters at todo.
    let stranded = !SUBTASK_STATUSES.contains(&from) && matches!(to, "todo" | "canceled");
    let legal = stranded
        || matches!(
            (from, to),
            ("todo", "in_progress")
                | ("todo", "canceled")
                | ("in_progress", "todo")
                | ("in_progress", "done")
                | ("in_progress", "canceled")
                | ("canceled", "todo")
        );
    if legal {
        Ok(())
    } else {
        Err(format!("a Subtask cannot move from {from} to {to}"))
    }
}

pub fn check_release_move(from: &str, to: &str, client_project: bool) -> Result<(), String> {
    if !RELEASE_STATES.contains(&to) {
        return Err(format!(
            "'{to}' is not a Release state (expected one of: {})",
            RELEASE_STATES.join(", ")
        ));
    }
    let legal = matches!(
        (from, to),
        ("planned", "user_testing")
            | ("planned", "released")
            | ("planned", "canceled")
            | ("user_testing", "released")
            | ("user_testing", "canceled")
    );
    if !legal {
        return Err(format!("a Release cannot move from {from} to {to}"));
    }
    if to == "user_testing" && !client_project {
        return Err("user_testing exists only on Client projects".into());
    }
    if from == "planned" && to == "released" && client_project {
        return Err("on a Client project a Release goes to user_testing before released".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts(status: &str) -> StoryFacts<'_> {
        StoryFacts {
            status,
            in_sprint: true,
            client_project: false,
            open_subtasks: 0,
            run_stopped: false,
            story_points: 3,
        }
    }

    #[test]
    fn a_story_with_no_points_cannot_become_ready() {
        let mut f = facts("refining");
        f.in_sprint = false;
        f.story_points = 0;
        let err = check_story_move(&f, "ready").unwrap_err();
        assert!(err.contains("0 points") && err.contains("split"), "{err}");
        for to in ["backlog", "canceled"] {
            check_story_move(&f, to).unwrap_or_else(|e| panic!("refining -> {to}: {e}"));
        }
        f.story_points = 1;
        check_story_move(&f, "ready").unwrap();
    }

    #[test]
    fn internal_happy_path_is_allowed() {
        let path = ["backlog", "refining", "ready", "building", "integrated_tests", "tested", "done"];
        for w in path.windows(2) {
            let mut f = facts(w[0]);
            f.in_sprint = !matches!(w[0], "backlog" | "refining");
            check_story_move(&f, w[1]).unwrap_or_else(|e| panic!("{} -> {}: {e}", w[0], w[1]));
        }
    }

    #[test]
    fn client_path_goes_through_user_testing() {
        let mut f = facts("tested");
        f.client_project = true;
        check_story_move(&f, "user_testing").unwrap();
        assert!(check_story_move(&f, "done").is_err());
        f.status = "user_testing";
        check_story_move(&f, "done").unwrap();
    }

    #[test]
    fn user_testing_refused_on_internal_projects() {
        let err = check_story_move(&facts("tested"), "user_testing").unwrap_err();
        assert!(err.contains("Client projects"), "{err}");
    }

    #[test]
    fn skipping_stages_is_refused() {
        let mut f = facts("backlog");
        f.in_sprint = false;
        assert!(check_story_move(&f, "ready").is_err());
        assert!(check_story_move(&facts("ready"), "integrated_tests").is_err());
        assert!(check_story_move(&facts("building"), "tested").is_err());
        assert!(check_story_move(&facts("building"), "done").is_err());
    }

    #[test]
    fn finished_stories_cannot_move() {
        for to in STORY_STATUSES {
            assert!(check_story_move(&facts("done"), to).is_err(), "done -> {to}");
        }
    }

    #[test]
    fn canceled_stories_can_be_reopened() {
        let mut f = facts("canceled");
        f.in_sprint = false;
        for to in ["backlog", "refining", "ready"] {
            check_story_move(&f, to).unwrap_or_else(|e| panic!("canceled -> {to}: {e}"));
        }
        f.in_sprint = true;
        check_story_move(&f, "ready").unwrap();
        let err = check_story_move(&f, "refining").unwrap_err();
        assert!(err.contains("remove it from the sprint"), "{err}");
        for in_sprint in [false, true] {
            f.in_sprint = in_sprint;
            for to in ["building", "integrated_tests", "tested", "user_testing", "done", "canceled"] {
                assert!(check_story_move(&f, to).is_err(), "canceled -> {to}");
            }
        }
    }

    #[test]
    fn any_open_status_can_be_canceled() {
        for s in &STORY_STATUSES[..7] {
            check_story_move(&facts(s), "canceled").unwrap();
        }
    }

    #[test]
    fn building_requires_a_sprint() {
        let mut f = facts("ready");
        f.in_sprint = false;
        let err = check_story_move(&f, "building").unwrap_err();
        assert!(err.contains("sprint"), "{err}");
    }

    #[test]
    fn leaving_for_discovery_requires_leaving_the_sprint() {
        let err = check_story_move(&facts("ready"), "refining").unwrap_err();
        assert!(err.contains("remove it from the sprint"), "{err}");
        let mut f = facts("ready");
        f.in_sprint = false;
        check_story_move(&f, "refining").unwrap();
    }

    #[test]
    fn open_subtasks_block_forward_moves_only() {
        let mut f = facts("building");
        f.open_subtasks = 2;
        let err = check_story_move(&f, "integrated_tests").unwrap_err();
        assert!(err.contains("2 open Subtask"), "{err}");
        f.status = "integrated_tests";
        check_story_move(&f, "building").unwrap();
        assert!(check_story_move(&f, "tested").is_err());
        f.status = "ready";
        check_story_move(&f, "building").unwrap();
    }

    #[test]
    fn stopped_run_blocks_forward_moves() {
        let mut f = facts("building");
        f.run_stopped = true;
        let err = check_story_move(&f, "integrated_tests").unwrap_err();
        assert!(err.contains("stopped"), "{err}");
        check_story_move(&f, "canceled").unwrap();
    }

    #[test]
    fn bug_loop_returns_to_building() {
        for s in ["integrated_tests", "tested", "user_testing"] {
            check_story_move(&facts(s), "building").unwrap();
        }
    }

    #[test]
    fn unknown_and_legacy_statuses_are_refused() {
        for to in ["todo", "in_review", "ready_for_development", "nonsense"] {
            let err = check_story_move(&facts("ready"), to).unwrap_err();
            assert!(err.contains("not a Story status"), "{err}");
        }
    }

    #[test]
    fn a_stranded_story_re_enters_the_ladder_at_a_pedro_stage() {
        for from in ["todo", "in_progress", "in_review", "ready_for_development"] {
            let mut f = facts(from);
            f.in_sprint = false;
            for to in ["backlog", "refining", "ready", "canceled"] {
                check_story_move(&f, to).unwrap_or_else(|e| panic!("{from} -> {to}: {e}"));
            }
            for to in ["building", "integrated_tests", "tested", "done"] {
                assert!(check_story_move(&f, to).is_err(), "{from} -> {to}");
            }
        }
        // The sprint guards still apply: in a sprint, only ready is open.
        let f = facts("todo");
        check_story_move(&f, "ready").unwrap();
        let err = check_story_move(&f, "refining").unwrap_err();
        assert!(err.contains("remove it from the sprint"), "{err}");
    }

    #[test]
    fn a_stranded_subtask_re_enters_at_todo() {
        for from in ["in_review", "refining", "ready_for_development"] {
            check_subtask_move(from, "todo").unwrap();
            check_subtask_move(from, "canceled").unwrap();
            assert!(check_subtask_move(from, "in_progress").is_err());
            assert!(check_subtask_move(from, "done").is_err());
        }
    }

    #[test]
    fn owner_follows_status() {
        assert_eq!(story_owner("backlog"), Owner::Pedro);
        assert_eq!(story_owner("ready"), Owner::Pedro);
        assert_eq!(story_owner("building"), Owner::Agent);
        assert_eq!(story_owner("integrated_tests"), Owner::Pedro);
        assert_eq!(story_owner("tested"), Owner::Pedro);
        assert_eq!(story_owner("user_testing"), Owner::ClientContact);
        assert_eq!(story_owner("done"), Owner::Nobody);
    }

    #[test]
    fn subtask_ladder() {
        check_subtask_move("todo", "in_progress").unwrap();
        check_subtask_move("in_progress", "done").unwrap();
        check_subtask_move("in_progress", "todo").unwrap();
        check_subtask_move("todo", "canceled").unwrap();
        assert!(check_subtask_move("todo", "done").is_err());
        assert!(check_subtask_move("done", "in_progress").is_err());
        check_subtask_move("canceled", "todo").unwrap();
        assert!(check_subtask_move("canceled", "in_progress").is_err());
        assert!(check_subtask_move("canceled", "done").is_err());
        assert!(check_subtask_move("todo", "in_review").is_err());
    }

    #[test]
    fn release_states() {
        check_release_move("planned", "released", false).unwrap();
        assert!(check_release_move("planned", "user_testing", false).is_err());
        check_release_move("planned", "user_testing", true).unwrap();
        assert!(check_release_move("planned", "released", true).is_err());
        check_release_move("user_testing", "released", true).unwrap();
        assert!(check_release_move("released", "canceled", true).is_err());
    }
}
