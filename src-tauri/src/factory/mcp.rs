//! `flowboard-cli mcp`: a stdio MCP server over the same domain operations as
//! the CLI. Every call acts as the Agent. Setup operations (factory roles,
//! project ladder/kind, contacts) stay CLI-only, so an agent cannot switch a
//! project's ladder.

use super::ops::{self, Actor, NewEpic, NewStory, NewSubtask, StoryEdit};
use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{Implementation, ServerCapabilities, ServerConfig};
use rmcp::{schemars, tool, tool_handler, tool_router, ServerHandler, ServiceExt};
use serde::Deserialize;
use serde_json::Value;
use sqlx::SqlitePool;

const AGENT: Actor = Actor::Agent;

fn out(r: Result<Value, String>) -> Result<String, String> {
    r.map(|v| serde_json::to_string_pretty(&v).unwrap_or_default())
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct Key {
    /// Issue key, e.g. SF-2
    pub key: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct Project {
    /// Project key, e.g. FB
    pub project: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct StoryCreate {
    pub project: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    /// low | medium | high | critical (default medium)
    pub priority: Option<String>,
    /// Comma-separated labels
    #[serde(default)]
    pub labels: String,
    /// true files a bug Story (a fix found in production)
    #[serde(default)]
    pub bug: bool,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct StoryEditArgs {
    pub key: String,
    pub title: Option<String>,
    /// Replaces the whole description (the Story's brief)
    pub description: Option<String>,
    pub priority: Option<String>,
    pub labels: Option<String>,
    /// Epic key to put the Story in (an open epic of its project), or null to
    /// take it out; leave it out to keep the current epic
    #[serde(default, deserialize_with = "crate::commands::deserialize_optional_field")]
    pub epic: Option<Option<String>>,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct EpicCreate {
    pub project: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    /// low | medium | high | critical (default medium)
    pub priority: Option<String>,
    /// Comma-separated labels
    #[serde(default)]
    pub labels: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct EpicList {
    pub project: String,
    /// todo (open, the default) | done | canceled | all
    pub status: Option<String>,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct Move {
    pub key: String,
    /// Target status
    pub to: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct SetSprint {
    pub key: String,
    /// Sprint id, or null to take the Story out of its sprint
    pub sprint_id: Option<i64>,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct SetBranch {
    pub key: String,
    pub branch: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct Link {
    pub key: String,
    /// Key of the Story this one depends on
    pub depends_on: String,
    /// true removes the link instead of adding it
    #[serde(default)]
    pub remove: bool,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct Comment {
    pub key: String,
    /// Markdown
    pub body: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct Review {
    pub key: String,
    /// passed | failed
    pub verdict: String,
    /// The commit that was reviewed
    pub commit: String,
    pub findings_url: Option<String>,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct Stop {
    pub key: String,
    pub reason: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct PrOpen {
    pub key: String,
    pub url: String,
    /// Target branch, e.g. develop
    pub target: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct PrState {
    pub key: String,
    pub url: String,
    /// merged | closed
    pub state: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct SubtaskCreate {
    /// Key of the parent Story
    pub story: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    /// true files a bug Subtask
    #[serde(default)]
    pub bug: bool,
    /// Estimate
    #[serde(default)]
    pub story_points: i64,
    #[serde(default)]
    pub risk: bool,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct Handoff {
    pub key: String,
    /// Role agent or Specialist name
    pub agent: String,
    pub model: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct Verify {
    pub key: String,
    pub passed: bool,
    #[serde(default)]
    pub reason: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct Release {
    pub project: String,
    /// Semver, e.g. 1.6.0
    pub version: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct ReleaseMove {
    pub project: String,
    pub version: String,
    /// planned | user_testing | released | canceled
    pub to: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct ReleaseSetVersion {
    pub project: String,
    pub version: String,
    /// Semver, e.g. 1.7.0
    pub new_version: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct Pick {
    pub version: String,
    /// Story key; the Release is looked up in the Story's project
    pub key: String,
}

#[derive(Clone)]
pub struct FlowboardMcp {
    pool: SqlitePool,
    tool_router: ToolRouter<Self>,
}

#[tool_router]
impl FlowboardMcp {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool, tool_router: Self::tool_router() }
    }

    #[tool(description = "Show a Factory Story: status, flags, fields, Subtasks, PRs, links, Release")]
    async fn story_show(&self, Parameters(p): Parameters<Key>) -> Result<String, String> {
        out(ops::story_show(&self.pool, &p.key).await)
    }

    #[tool(description = "A Story's Run trail (activity events, oldest first)")]
    async fn story_trail(&self, Parameters(p): Parameters<Key>) -> Result<String, String> {
        out(ops::trail(&self.pool, &p.key).await)
    }

    #[tool(description = "Create a Story (or a bug Story) in backlog on a Factory project")]
    async fn story_create(&self, Parameters(p): Parameters<StoryCreate>) -> Result<String, String> {
        let s = NewStory {
            project: &p.project,
            title: &p.title,
            description: &p.description,
            priority: p.priority.as_deref().unwrap_or("medium"),
            labels: &p.labels,
            bug: p.bug,
        };
        out(ops::story_create(&self.pool, s, AGENT).await)
    }

    #[tool(description = "Edit a Story's title, description, priority, labels or epic (a key, or null to take it out)")]
    async fn story_edit(&self, Parameters(p): Parameters<StoryEditArgs>) -> Result<String, String> {
        let e = StoryEdit {
            title: p.title.as_deref(),
            description: p.description.as_deref(),
            priority: p.priority.as_deref(),
            labels: p.labels.as_deref(),
            epic: p.epic.as_ref().map(|e| e.as_deref()),
        };
        out(ops::story_edit(&self.pool, &p.key, e).await)
    }

    #[tool(description = "Move a Story along the ladder: backlog, refining, ready, building, integrated_tests, tested, user_testing, done, canceled. Illegal moves are refused with the reason.")]
    async fn story_move(&self, Parameters(p): Parameters<Move>) -> Result<String, String> {
        out(ops::story_move(&self.pool, &p.key, &p.to, AGENT).await)
    }

    #[tool(description = "Put a Story into a sprint (only at ready), take it out (null), or carry it to another sprint")]
    async fn story_set_sprint(&self, Parameters(p): Parameters<SetSprint>) -> Result<String, String> {
        out(ops::story_set_sprint(&self.pool, &p.key, p.sprint_id).await)
    }

    #[tool(description = "Record a Story's Feature branch")]
    async fn story_set_branch(&self, Parameters(p): Parameters<SetBranch>) -> Result<String, String> {
        out(ops::story_set_branch(&self.pool, &p.key, &p.branch).await)
    }

    #[tool(description = "Add or remove a depends-on link between two Stories")]
    async fn story_link(&self, Parameters(p): Parameters<Link>) -> Result<String, String> {
        if p.remove {
            out(ops::link_remove(&self.pool, &p.key, &p.depends_on).await)
        } else {
            out(ops::link_add(&self.pool, &p.key, &p.depends_on).await)
        }
    }

    #[tool(description = "Post a comment on a Story as the Agent; returns its id and a flowboard://comment/<id> link")]
    async fn story_comment(&self, Parameters(p): Parameters<Comment>) -> Result<String, String> {
        out(ops::story_comment(&self.pool, &p.key, &p.body, AGENT).await)
    }

    #[tool(description = "Record a Review round's verdict on a building Story")]
    async fn review_record(&self, Parameters(p): Parameters<Review>) -> Result<String, String> {
        out(ops::review_record(&self.pool, &p.key, &p.verdict, &p.commit, p.findings_url.as_deref(), AGENT).await)
    }

    #[tool(description = "Log the start of a Review round on a building Story")]
    async fn review_start(&self, Parameters(p): Parameters<Key>) -> Result<String, String> {
        out(ops::review_start(&self.pool, &p.key, AGENT).await)
    }

    #[tool(description = "Log the start of a Verify round on an in_progress Subtask of a building Story")]
    async fn verify_start(&self, Parameters(p): Parameters<Key>) -> Result<String, String> {
        out(ops::verify_start(&self.pool, &p.key, AGENT).await)
    }

    #[tool(description = "Stop a building Story's Run and hand it to Pedro")]
    async fn run_stop(&self, Parameters(p): Parameters<Stop>) -> Result<String, String> {
        out(ops::run_stop(&self.pool, &p.key, &p.reason, AGENT).await)
    }

    #[tool(description = "Restart a stopped Run")]
    async fn run_restart(&self, Parameters(p): Parameters<Key>) -> Result<String, String> {
        out(ops::run_restart(&self.pool, &p.key, AGENT).await)
    }

    #[tool(description = "Record a PR opened for a Story")]
    async fn pr_open(&self, Parameters(p): Parameters<PrOpen>) -> Result<String, String> {
        out(ops::pr_open(&self.pool, &p.key, &p.url, &p.target, AGENT).await)
    }

    #[tool(description = "Record a Story's PR as merged or closed")]
    async fn pr_set_state(&self, Parameters(p): Parameters<PrState>) -> Result<String, String> {
        out(ops::pr_set_state(&self.pool, &p.key, &p.url, &p.state, AGENT).await)
    }

    #[tool(description = "Create a Subtask (or a bug Subtask) under a Story")]
    async fn subtask_create(&self, Parameters(p): Parameters<SubtaskCreate>) -> Result<String, String> {
        let s = NewSubtask {
            story: &p.story,
            title: &p.title,
            description: &p.description,
            bug: p.bug,
            story_points: p.story_points,
            risk: p.risk,
        };
        out(ops::subtask_create(&self.pool, s, AGENT).await)
    }

    #[tool(description = "Move a Subtask: todo, in_progress, done, canceled")]
    async fn subtask_move(&self, Parameters(p): Parameters<Move>) -> Result<String, String> {
        out(ops::subtask_move(&self.pool, &p.key, &p.to, AGENT).await)
    }

    #[tool(description = "Record a Subtask being handed to an agent and model")]
    async fn subtask_handoff(&self, Parameters(p): Parameters<Handoff>) -> Result<String, String> {
        out(ops::subtask_handoff(&self.pool, &p.key, &p.agent, &p.model, AGENT).await)
    }

    #[tool(description = "Record a Verify round's result for a Subtask")]
    async fn subtask_verify(&self, Parameters(p): Parameters<Verify>) -> Result<String, String> {
        out(ops::subtask_verify(&self.pool, &p.key, p.passed, &p.reason, AGENT).await)
    }

    #[tool(description = "Create an epic (a goal grouping several Stories) on a Factory project; it starts open at todo, with no sprint and no points")]
    async fn epic_create(&self, Parameters(p): Parameters<EpicCreate>) -> Result<String, String> {
        let e = NewEpic {
            project: &p.project,
            title: &p.title,
            description: &p.description,
            priority: p.priority.as_deref().unwrap_or("medium"),
            labels: &p.labels,
        };
        out(ops::epic_create(&self.pool, e, AGENT).await)
    }

    #[tool(description = "Close an open epic (todo -> done) or cancel it (todo -> canceled). Any other move, reopening included, is refused with the reason.")]
    async fn epic_move(&self, Parameters(p): Parameters<Move>) -> Result<String, String> {
        out(ops::epic_move(&self.pool, &p.key, &p.to, AGENT).await)
    }

    #[tool(description = "Show an epic: key, title, status, description and its Stories (key, title, type, status), canceled ones included")]
    async fn epic_show(&self, Parameters(p): Parameters<Key>) -> Result<String, String> {
        out(ops::epic_show(&self.pool, &p.key).await)
    }

    #[tool(description = "List a Factory project's epics with their status and Story counts by status (canceled Stories counted). \
                          status: todo (open, the default), done, canceled or all")]
    async fn epic_list(&self, Parameters(p): Parameters<EpicList>) -> Result<String, String> {
        out(ops::epic_list(&self.pool, &p.project, p.status.as_deref()).await)
    }

    #[tool(description = "Show a project's ladder, kind and client contacts")]
    async fn project_show(&self, Parameters(p): Parameters<Project>) -> Result<String, String> {
        out(ops::project_show(&self.pool, &p.project).await)
    }

    #[tool(description = "Show a Release and its picked Stories")]
    async fn release_show(&self, Parameters(p): Parameters<Release>) -> Result<String, String> {
        out(ops::release_show(&self.pool, &p.project, &p.version).await)
    }

    #[tool(description = "Create a planned Release")]
    async fn release_create(&self, Parameters(p): Parameters<Release>) -> Result<String, String> {
        out(ops::release_create(&self.pool, &p.project, &p.version).await)
    }

    #[tool(description = "List a project's Releases with their state and Story count")]
    async fn release_list(&self, Parameters(p): Parameters<Project>) -> Result<String, String> {
        out(ops::release_list(&self.pool, &p.project).await)
    }

    #[tool(description = "Change a planned Release's version")]
    async fn release_set_version(&self, Parameters(p): Parameters<ReleaseSetVersion>) -> Result<String, String> {
        out(ops::release_set_version(&self.pool, &p.project, &p.version, &p.new_version).await)
    }

    #[tool(description = "Move a Release: planned, user_testing, released, canceled. Its picked Stories move with it \
                          (user_testing -> user_testing, released -> done); refused when it is empty or a pick is not ready")]
    async fn release_move(&self, Parameters(p): Parameters<ReleaseMove>) -> Result<String, String> {
        out(ops::release_move(&self.pool, &p.project, &p.version, &p.to, AGENT).await)
    }

    #[tool(description = "Pick a tested Story into a Release; warns about unreleased dependencies")]
    async fn release_pick(&self, Parameters(p): Parameters<Pick>) -> Result<String, String> {
        out(ops::release_pick(&self.pool, &p.version, &p.key, AGENT).await)
    }

    #[tool(description = "Remove a Story from its Release")]
    async fn release_remove(&self, Parameters(p): Parameters<Key>) -> Result<String, String> {
        out(ops::release_remove(&self.pool, &p.key, AGENT).await)
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for FlowboardMcp {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("flowboard", env!("CARGO_PKG_VERSION")))
            .with_instructions(
            "Flowboard domain operations for Factory projects. Moves are checked against the \
             Story/Subtask/Release ladders; a refused move returns the reason and changes nothing.",
        )
    }
}

pub async fn serve(pool: SqlitePool) -> Result<(), String> {
    let service = FlowboardMcp::new(pool)
        .serve(rmcp::transport::stdio())
        .await
        .map_err(|e| e.to_string())?;
    service.waiting().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{EpicList, FlowboardMcp, StoryCreate, StoryEditArgs};

    #[test]
    fn the_router_serves_the_epic_tools() {
        let router = FlowboardMcp::tool_router();
        for tool in ["epic_create", "epic_move", "epic_show", "epic_list"] {
            assert!(router.has_route(tool), "{tool} is not in the MCP tool router");
        }
    }

    #[test]
    fn epic_list_takes_an_optional_status() {
        let schema = schemars::schema_for!(EpicList);
        let schema = schema.as_value();
        let required = schema["required"].as_array().unwrap();
        assert!(required.iter().any(|r| r == "project"), "project is required: {schema}");
        assert!(!required.iter().any(|r| r == "status"), "status is optional: {schema}");

        let p: EpicList = serde_json::from_str(r#"{"project":"SF"}"#).unwrap();
        assert_eq!(p.status, None, "absent falls to the todo default");
        let p: EpicList = serde_json::from_str(r#"{"project":"SF","status":"all"}"#).unwrap();
        assert_eq!(p.status.as_deref(), Some("all"));
    }

    #[test]
    fn story_create_takes_an_optional_bug_flag() {
        let schema = schemars::schema_for!(StoryCreate);
        let schema = schema.as_value();
        assert_eq!(schema["properties"]["bug"]["type"], "boolean", "{schema}");
        let required = schema["required"].as_array().unwrap();
        assert!(!required.iter().any(|r| r == "bug"), "bug is optional: {schema}");

        let p: StoryCreate = serde_json::from_str(r#"{"project":"SF","title":"t"}"#).unwrap();
        assert!(!p.bug);
        let p: StoryCreate = serde_json::from_str(r#"{"project":"SF","title":"t","bug":true}"#).unwrap();
        assert!(p.bug);
    }

    #[test]
    fn story_edit_tells_an_absent_epic_from_null() {
        let schema = schemars::schema_for!(StoryEditArgs);
        let schema = schema.as_value();
        let required = schema["required"].as_array().unwrap();
        assert!(!required.iter().any(|r| r == "epic"), "epic is optional: {schema}");

        let p: StoryEditArgs = serde_json::from_str(r#"{"key":"SF-2"}"#).unwrap();
        assert_eq!(p.epic, None, "absent keeps the epic");
        let p: StoryEditArgs = serde_json::from_str(r#"{"key":"SF-2","epic":null}"#).unwrap();
        assert_eq!(p.epic, Some(None), "null takes the Story out");
        let p: StoryEditArgs = serde_json::from_str(r#"{"key":"SF-2","epic":"SF-1"}"#).unwrap();
        assert_eq!(p.epic, Some(Some("SF-1".into())));
    }
}
