//! End-to-end checks of the flowboard-cli binary against a temporary database:
//! JSON output, exit codes, and the MCP server over stdio.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const CLI: &str = env!("CARGO_BIN_EXE_flowboard-cli");

async fn seeded_db(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("flowboard-cli-test-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("flowboard.db");
    let pool = flowboard_lib::db::open_and_migrate(&path).await.unwrap();
    sqlx::query("INSERT INTO people (name, email) VALUES ('Pedro', 'p@test'), ('Claude', 'c@test')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO projects (name, key, created_at) VALUES ('Test', 'TF', '2026-01-01T00:00:00.000Z')")
        .execute(&pool)
        .await
        .unwrap();
    pool.close().await;
    path
}

fn cli(db: &Path, args: &[&str]) -> (i32, Value, Value) {
    let out = Command::new(CLI).arg("--db").arg(db).args(args).output().unwrap();
    let parse = |b: &[u8]| serde_json::from_slice::<Value>(b).unwrap_or(Value::Null);
    (out.status.code().unwrap_or(-1), parse(&out.stdout), parse(&out.stderr))
}

fn ok(db: &Path, args: &[&str]) -> Value {
    let (code, stdout, stderr) = cli(db, args);
    assert_eq!(code, 0, "{args:?} failed: {stderr}");
    stdout
}

fn setup(db: &Path) {
    ok(db, &["people", "set-role", "1", "owner"]);
    ok(db, &["people", "set-role", "2", "agent"]);
    ok(db, &["project", "set", "TF", "--ladder", "factory"]);
}

#[tokio::test]
async fn cli_moves_a_story_and_refuses_illegal_moves() {
    let db = seeded_db("moves").await;
    setup(&db);
    let story = ok(&db, &["--as", "owner", "story", "create", "TF", "First story"]);
    assert_eq!(story["key"], "TF-1");
    assert_eq!(story["status"], "backlog");
    assert_eq!(story["assignee"], "Pedro");

    let (code, _, stderr) = cli(&db, &["story", "move", "TF-1", "building"]);
    assert_eq!(code, 1);
    assert!(stderr["error"].as_str().unwrap().contains("cannot move from backlog to building"), "{stderr}");

    let moved = ok(&db, &["story", "move", "TF-1", "refining"]);
    assert_eq!(moved["status"], "refining");
    let trail = ok(&db, &["story", "trail", "TF-1"]);
    assert_eq!(trail.as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn cli_lists_releases_and_changes_a_planned_version() {
    let db = seeded_db("releases").await;
    setup(&db);
    ok(&db, &["release", "create", "TF", "1.6.0"]);
    let shown = ok(&db, &["release", "set-version", "TF", "1.6.0", "1.7.0"]);
    assert_eq!(shown["version"], "1.7.0");

    let list = ok(&db, &["release", "list", "TF"]);
    assert_eq!(list["releases"][0]["version"], "1.7.0");
    assert_eq!(list["releases"][0]["stories"], 0);

    let (code, _, stderr) = cli(&db, &["release", "move", "TF", "1.7.0", "released"]);
    assert_eq!(code, 1);
    assert!(stderr["error"].as_str().unwrap().contains("no picked Stories"), "{stderr}");
}

#[tokio::test]
async fn cli_posts_a_comment_from_a_file() {
    let db = seeded_db("comment").await;
    setup(&db);
    ok(&db, &["story", "create", "TF", "Reviewed"]);
    let file = db.with_file_name("findings.md");
    std::fs::write(&file, "## Round 1\n- blocking: x").unwrap();
    let c = ok(&db, &["story", "comment", "TF-1", "--body-file", file.to_str().unwrap()]);
    assert_eq!(c["key"], "TF-1");
    assert_eq!(c["url"], format!("flowboard://comment/{}", c["id"]));

    let (code, _, _) = cli(&db, &["story", "comment", "TF-1"]);
    assert_ne!(code, 0, "a body or a body file is required");
}

#[tokio::test]
async fn cli_refuses_legacy_projects() {
    let db = seeded_db("legacy").await;
    ok(&db, &["people", "set-role", "1", "owner"]);
    let (code, _, stderr) = cli(&db, &["story", "create", "TF", "x"]);
    assert_eq!(code, 1);
    assert!(stderr["error"].as_str().unwrap().contains("legacy"), "{stderr}");
}

#[tokio::test]
async fn cli_reports_a_missing_database() {
    let (code, _, stderr) = cli(Path::new("C:/does/not/exist/flowboard.db"), &["people", "list"]);
    assert_eq!(code, 1);
    assert!(stderr["error"].as_str().unwrap().contains("no Flowboard database"), "{stderr}");
}

#[tokio::test]
async fn mcp_serves_tools_and_returns_refusals_as_errors() {
    let db = seeded_db("mcp").await;
    setup(&db);
    ok(&db, &["story", "create", "TF", "Via MCP"]);

    let mut child = Command::new(CLI)
        .arg("--db")
        .arg(&db)
        .arg("mcp")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = BufReader::new(child.stdout.take().unwrap());
    let mut send = move |msg: Value| {
        writeln!(stdin, "{msg}").unwrap();
        stdin.flush().unwrap();
    };
    let mut recv = || {
        let mut line = String::new();
        stdout.read_line(&mut line).unwrap();
        serde_json::from_str::<Value>(&line).unwrap()
    };

    send(json!({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2025-06-18", "capabilities": {},
        "clientInfo": {"name": "test", "version": "0"}}}));
    let init = recv();
    assert!(init["result"]["capabilities"]["tools"].is_object(), "{init}");
    send(json!({"jsonrpc": "2.0", "method": "notifications/initialized"}));

    send(json!({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}));
    let tools = recv();
    let names: Vec<&str> = tools["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    for n in ["story_move", "subtask_verify", "review_record", "release_pick", "release_list", "release_set_version"] {
        assert!(names.contains(&n), "missing tool {n}: {names:?}");
    }
    assert!(!names.contains(&"project_set"), "ladder changes must stay CLI-only");

    send(json!({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {
        "name": "story_move", "arguments": {"key": "TF-1", "to": "done"}}}));
    let refused = recv();
    assert_eq!(refused["result"]["isError"], true, "{refused}");

    send(json!({"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {
        "name": "story_move", "arguments": {"key": "TF-1", "to": "refining"}}}));
    let moved = recv();
    assert_ne!(moved["result"]["isError"], true, "{moved}");
    let text = moved["result"]["content"][0]["text"].as_str().unwrap();
    assert_eq!(serde_json::from_str::<Value>(text).unwrap()["status"], "refining");

    drop(send); // closes the server's stdin, which ends the session
    assert!(child.wait().unwrap().success());
}
