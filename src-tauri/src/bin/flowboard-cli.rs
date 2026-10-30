//! Flowboard CLI: the domain-level interface the Software Factory uses to write
//! to the board (hooks call it; `flowboard-cli mcp` serves the same operations
//! to agents). Writes the same SQLite file as the app and works with it closed.
//!
//! Output is JSON on stdout. A refused or failed operation prints
//! `{"error": "..."}` on stderr and exits with code 1.

use clap::{Parser, Subcommand, ValueEnum};
use flowboard_lib::factory::ops::{self, Actor, NewEpic, NewStory, NewSubtask, StoryEdit};
use flowboard_lib::factory::mcp;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "flowboard-cli", version, about = "Flowboard domain operations for Software Factory projects")]
struct Cli {
    /// Which app's database to use
    #[arg(long, value_enum, default_value_t = Env::Prod, global = true)]
    env: Env,
    /// Explicit database path (overrides --env and FLOWBOARD_DB)
    #[arg(long, global = true)]
    db: Option<PathBuf>,
    /// Who the events are attributed to
    #[arg(long = "as", value_enum, default_value_t = As::Agent, global = true)]
    actor: As,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Clone, Copy, ValueEnum)]
enum Env {
    Prod,
    Staging,
}

#[derive(Clone, Copy, ValueEnum)]
enum As {
    Owner,
    Agent,
}

#[derive(Subcommand)]
enum Cmd {
    /// People and their factory roles
    #[command(subcommand)]
    People(PeopleCmd),
    /// Project ladder, kind and client contacts
    #[command(subcommand)]
    Project(ProjectCmd),
    /// Client contacts of a project
    #[command(subcommand)]
    Contact(ContactCmd),
    /// Factory Stories
    #[command(subcommand)]
    Story(StoryCmd),
    /// Epics: goals that group several Stories (never built)
    #[command(subcommand)]
    Epic(EpicCmd),
    /// Record a Review round on a building Story
    Review {
        key: String,
        #[arg(value_parser = ["passed", "failed"])]
        verdict: String,
        #[arg(long)]
        commit: String,
        #[arg(long)]
        findings: Option<String>,
    },
    /// Stop or restart a Story's Run
    #[command(subcommand)]
    Run(RunCmd),
    /// PRs recorded on a Story
    #[command(subcommand)]
    Pr(PrCmd),
    /// Subtasks of a Story: ladder, handoffs, Verify rounds
    #[command(subcommand)]
    Subtask(SubtaskCmd),
    /// Releases and their picked Stories
    #[command(subcommand)]
    Release(ReleaseCmd),
    /// Serve the domain operations as an MCP server on stdio
    Mcp,
}

#[derive(Subcommand)]
enum PeopleCmd {
    List,
    /// Give a person the owner or agent role (`none` clears it)
    SetRole {
        person_id: i64,
        #[arg(value_parser = ["owner", "agent", "none"])]
        role: String,
    },
}

#[derive(Subcommand)]
enum ProjectCmd {
    Show { project: String },
    Set {
        project: String,
        #[arg(long, value_parser = ["legacy", "factory"])]
        ladder: Option<String>,
        #[arg(long, value_parser = ["internal", "client"])]
        kind: Option<String>,
    },
}

#[derive(Subcommand)]
enum ContactCmd {
    Add {
        project: String,
        person_id: i64,
        #[arg(long)]
        primary: bool,
    },
    Remove { project: String, person_id: i64 },
}

#[derive(Subcommand)]
enum StoryCmd {
    Create {
        project: String,
        title: String,
        #[arg(long, default_value = "")]
        description: String,
        #[arg(long, default_value = "medium")]
        priority: String,
        #[arg(long, default_value = "")]
        labels: String,
        /// File a bug Story (a fix) instead of a feature Story
        #[arg(long)]
        bug: bool,
    },
    Show { key: String },
    /// The Story's Run trail
    Trail { key: String },
    Edit {
        key: String,
        #[arg(long)]
        title: Option<String>,
        #[arg(long)]
        description: Option<String>,
        #[arg(long)]
        priority: Option<String>,
        #[arg(long)]
        labels: Option<String>,
        /// Put the Story in this epic (a key), or take it out with `none`
        #[arg(long)]
        epic: Option<String>,
    },
    Move { key: String, to: String },
    /// Put into a sprint, carry to another, or take out with `none`
    Sprint { key: String, sprint: String },
    Branch { key: String, branch: String },
    /// Post a comment, its body inline or read from a file
    Comment {
        key: String,
        #[arg(long, required_unless_present = "body_file", conflicts_with = "body_file")]
        body: Option<String>,
        #[arg(long)]
        body_file: Option<PathBuf>,
    },
    /// Add (or with --remove, drop) a depends-on link
    Link {
        key: String,
        depends_on: String,
        #[arg(long)]
        remove: bool,
    },
}

#[derive(Subcommand)]
enum EpicCmd {
    /// Create an open epic (todo, no sprint, no points)
    Create {
        project: String,
        title: String,
        #[arg(long, default_value = "")]
        description: String,
        #[arg(long, default_value = "medium")]
        priority: String,
        #[arg(long, default_value = "")]
        labels: String,
    },
    /// Close (done) or cancel (canceled) an open epic
    Move { key: String, to: String },
}

#[derive(Subcommand)]
enum RunCmd {
    Stop {
        key: String,
        #[arg(long)]
        reason: String,
    },
    Restart { key: String },
    ReviewStart { key: String },
}

#[derive(Subcommand)]
enum PrCmd {
    Open {
        key: String,
        url: String,
        #[arg(long)]
        target: String,
    },
    Merged { key: String, url: String },
    Closed { key: String, url: String },
}

#[derive(Subcommand)]
enum SubtaskCmd {
    Create {
        story: String,
        title: String,
        #[arg(long, default_value = "")]
        description: String,
        #[arg(long)]
        bug: bool,
        #[arg(long, default_value_t = 0)]
        points: i64,
        #[arg(long)]
        risk: bool,
    },
    Move { key: String, to: String },
    Handoff {
        key: String,
        #[arg(long)]
        agent: String,
        #[arg(long)]
        model: String,
    },
    Verify {
        key: String,
        #[arg(value_parser = ["pass", "fail"])]
        result: String,
        #[arg(long, default_value = "")]
        reason: String,
    },
}

#[derive(Subcommand)]
enum ReleaseCmd {
    Create { project: String, version: String },
    Show { project: String, version: String },
    /// The project's Releases, oldest first
    List { project: String },
    /// Change a planned Release's version
    SetVersion { project: String, version: String, new_version: String },
    /// Move a Release; its picked Stories move with it
    Move { project: String, version: String, to: String },
    /// Pick a tested Story into a Release of its project
    Pick { version: String, story: String },
    Remove { story: String },
}

fn db_path(cli: &Cli) -> Result<PathBuf, String> {
    if let Some(p) = &cli.db {
        return Ok(p.clone());
    }
    if let Ok(p) = std::env::var("FLOWBOARD_DB") {
        return Ok(PathBuf::from(p));
    }
    let appdata = std::env::var("APPDATA").map_err(|_| "APPDATA is not set; pass --db".to_string())?;
    let identifier = match cli.env {
        Env::Prod => "com.flowboard.app",
        Env::Staging => "com.flowboard.staging",
    };
    Ok(PathBuf::from(appdata).join(identifier).join("flowboard.db"))
}

async fn run(cli: Cli, pool: SqlitePool) -> Result<Value, String> {
    let actor = match cli.actor {
        As::Owner => Actor::Owner,
        As::Agent => Actor::Agent,
    };
    let p = &pool;
    match cli.cmd {
        Cmd::People(PeopleCmd::List) => ops::people_list(p).await,
        Cmd::People(PeopleCmd::SetRole { person_id, role }) => {
            let role = (role != "none").then_some(role.as_str());
            ops::people_set_role(p, person_id, role).await
        }
        Cmd::Project(ProjectCmd::Show { project }) => ops::project_show(p, &project).await,
        Cmd::Project(ProjectCmd::Set { project, ladder, kind }) => {
            ops::project_set(p, &project, ladder.as_deref(), kind.as_deref()).await
        }
        Cmd::Contact(ContactCmd::Add { project, person_id, primary }) => {
            ops::contact_add(p, &project, person_id, primary).await
        }
        Cmd::Contact(ContactCmd::Remove { project, person_id }) => {
            ops::contact_remove(p, &project, person_id).await
        }
        Cmd::Story(s) => match s {
            StoryCmd::Create { project, title, description, priority, labels, bug } => {
                let s = NewStory {
                    project: &project,
                    title: &title,
                    description: &description,
                    priority: &priority,
                    labels: &labels,
                    bug,
                };
                ops::story_create(p, s, actor).await
            }
            StoryCmd::Show { key } => ops::story_show(p, &key).await,
            StoryCmd::Trail { key } => ops::trail(p, &key).await,
            StoryCmd::Edit { key, title, description, priority, labels, epic } => {
                let e = StoryEdit {
                    title: title.as_deref(),
                    description: description.as_deref(),
                    priority: priority.as_deref(),
                    labels: labels.as_deref(),
                    epic: epic_arg(epic.as_deref()),
                };
                ops::story_edit(p, &key, e).await
            }
            StoryCmd::Move { key, to } => ops::story_move(p, &key, &to, actor).await,
            StoryCmd::Sprint { key, sprint } => {
                let sprint_id = if sprint == "none" {
                    None
                } else {
                    Some(sprint.parse::<i64>().map_err(|_| format!("'{sprint}' is not a sprint id or none"))?)
                };
                ops::story_set_sprint(p, &key, sprint_id).await
            }
            StoryCmd::Branch { key, branch } => ops::story_set_branch(p, &key, &branch).await,
            StoryCmd::Comment { key, body, body_file } => {
                let body = match body_file {
                    Some(f) => std::fs::read_to_string(&f).map_err(|e| format!("{}: {e}", f.display()))?,
                    None => body.unwrap_or_default(),
                };
                ops::story_comment(p, &key, &body, actor).await
            }
            StoryCmd::Link { key, depends_on, remove } => {
                if remove {
                    ops::link_remove(p, &key, &depends_on).await
                } else {
                    ops::link_add(p, &key, &depends_on).await
                }
            }
        },
        Cmd::Epic(EpicCmd::Create { project, title, description, priority, labels }) => {
            let e = NewEpic {
                project: &project,
                title: &title,
                description: &description,
                priority: &priority,
                labels: &labels,
            };
            ops::epic_create(p, e, actor).await
        }
        Cmd::Epic(EpicCmd::Move { key, to }) => ops::epic_move(p, &key, &to, actor).await,
        Cmd::Review { key, verdict, commit, findings } => {
            ops::review_record(p, &key, &verdict, &commit, findings.as_deref(), actor).await
        }
        Cmd::Run(RunCmd::Stop { key, reason }) => ops::run_stop(p, &key, &reason, actor).await,
        Cmd::Run(RunCmd::Restart { key }) => ops::run_restart(p, &key, actor).await,
        Cmd::Run(RunCmd::ReviewStart { key }) => ops::review_start(p, &key, actor).await,
        Cmd::Pr(PrCmd::Open { key, url, target }) => ops::pr_open(p, &key, &url, &target, actor).await,
        Cmd::Pr(PrCmd::Merged { key, url }) => ops::pr_set_state(p, &key, &url, "merged", actor).await,
        Cmd::Pr(PrCmd::Closed { key, url }) => ops::pr_set_state(p, &key, &url, "closed", actor).await,
        Cmd::Subtask(s) => match s {
            SubtaskCmd::Create { story, title, description, bug, points, risk } => {
                let s = NewSubtask {
                    story: &story,
                    title: &title,
                    description: &description,
                    bug,
                    story_points: points,
                    risk,
                };
                ops::subtask_create(p, s, actor).await
            }
            SubtaskCmd::Move { key, to } => ops::subtask_move(p, &key, &to, actor).await,
            SubtaskCmd::Handoff { key, agent, model } => {
                ops::subtask_handoff(p, &key, &agent, &model, actor).await
            }
            SubtaskCmd::Verify { key, result, reason } => {
                ops::subtask_verify(p, &key, result == "pass", &reason, actor).await
            }
        },
        Cmd::Release(r) => match r {
            ReleaseCmd::Create { project, version } => ops::release_create(p, &project, &version).await,
            ReleaseCmd::Show { project, version } => ops::release_show(p, &project, &version).await,
            ReleaseCmd::List { project } => ops::release_list(p, &project).await,
            ReleaseCmd::SetVersion { project, version, new_version } => {
                ops::release_set_version(p, &project, &version, &new_version).await
            }
            ReleaseCmd::Move { project, version, to } => {
                ops::release_move(p, &project, &version, &to, actor).await
            }
            ReleaseCmd::Pick { version, story } => ops::release_pick(p, &version, &story, actor).await,
            ReleaseCmd::Remove { story } => ops::release_remove(p, &story, actor).await,
        },
        Cmd::Mcp => mcp::serve(pool.clone()).await.map(|_| Value::Null),
    }
}

/// `story edit --epic`: a key puts the Story in that epic, `none` takes it out.
fn epic_arg(epic: Option<&str>) -> Option<Option<&str>> {
    epic.map(|k| Some(k).filter(|k| *k != "none"))
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let result = async {
        let path = db_path(&cli)?;
        let pool = flowboard_lib::db::open_existing(&path).await?;
        let result = run(cli, pool.clone()).await;
        pool.close().await;
        result
    }
    .await;
    match result {
        Ok(Value::Null) => {}
        Ok(v) => println!("{}", serde_json::to_string_pretty(&v).unwrap_or_default()),
        Err(e) => {
            eprintln!("{}", json!({ "error": e }));
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Cli, Cmd, StoryCmd};
    use clap::{CommandFactory, Parser};

    #[test]
    fn epic_help_lists_create_and_move() {
        let help = Cli::command().find_subcommand_mut("epic").expect("an epic subcommand").render_help().to_string();
        for sub in ["create", "move"] {
            assert!(help.lines().any(|l| l.trim_start().starts_with(sub)), "`epic --help` lacks {sub}:
{help}");
        }
    }

    fn story_create_bug(args: &[&str]) -> bool {
        match Cli::try_parse_from(args).unwrap().cmd {
            Cmd::Story(StoryCmd::Create { bug, .. }) => bug,
            _ => panic!("not story create"),
        }
    }

    /// `story edit`'s epic as `ops::StoryEdit` takes it.
    fn story_edit_epic(args: &[&str]) -> Option<Option<String>> {
        match Cli::try_parse_from(args).unwrap().cmd {
            Cmd::Story(StoryCmd::Edit { epic, .. }) => super::epic_arg(epic.as_deref()).map(|e| e.map(String::from)),
            _ => panic!("not story edit"),
        }
    }

    #[test]
    fn story_edit_parses_the_epic_flag() {
        assert_eq!(story_edit_epic(&["flowboard-cli", "story", "edit", "SF-2"]), None);
        assert_eq!(story_edit_epic(&["flowboard-cli", "story", "edit", "SF-2", "--epic", "none"]), Some(None));
        assert_eq!(story_edit_epic(&["flowboard-cli", "story", "edit", "SF-2", "--epic", "SF-1"]), Some(Some("SF-1".into())));
    }

    #[test]
    fn story_create_parses_the_bug_flag() {
        assert!(story_create_bug(&["flowboard-cli", "story", "create", "SF", "a fix", "--bug"]));
        assert!(!story_create_bug(&["flowboard-cli", "story", "create", "SF", "a feature"]));
    }
}
