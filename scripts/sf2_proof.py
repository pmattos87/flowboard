"""SF-2 "Proven when" check, run against the STAGING database only.

Drives a test Story along the Factory ladder with flowboard-cli, checks that
illegal moves are refused, and that legacy projects are untouched.

    python scripts/sf2_proof.py [path/to/flowboard-cli.exe]

Setup it does directly in SQL (staging only): gives the first two people the
owner/agent roles if nobody has them, and creates a fresh throwaway Client
project PROOF<n> with one sprint. Everything else goes through the CLI.
"""

import json
import os
import sqlite3
import subprocess
import sys

CLI = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "src-tauri/target/debug/flowboard-cli.exe")
DB = os.path.join(os.environ["APPDATA"], "com.flowboard.staging", "flowboard.db")
failures = []


def cli(*args):
    p = subprocess.run([CLI, "--env", "staging", *args], capture_output=True, text=True)
    out = json.loads(p.stdout) if p.stdout.strip() else None
    err = json.loads(p.stderr)["error"] if p.stderr.strip().startswith("{") else p.stderr.strip()
    return p.returncode, out, err


def ok(*args):
    code, out, err = cli(*args)
    if code != 0:
        failures.append(f"{' '.join(args)} failed: {err}")
        print(f"FAIL  {' '.join(args)}: {err}")
    return out


def refused(label, *args):
    code, _, err = cli(*args)
    if code == 1:
        print(f"ok    refused: {label} -> {err}")
    else:
        failures.append(f"not refused: {label}")
        print(f"FAIL  not refused: {label}")


def check(label, cond):
    print(("ok    " if cond else "FAIL  ") + label)
    if not cond:
        failures.append(label)


def legacy_snapshot(conn):
    rows = conn.execute(
        "SELECT t.* FROM tasks t JOIN projects p ON p.id = t.project_id"
        " WHERE p.ladder = 'legacy' ORDER BY t.id"
    ).fetchall()
    acts = conn.execute(
        "SELECT a.* FROM activity_log a JOIN tasks t ON t.id = a.task_id"
        " JOIN projects p ON p.id = t.project_id WHERE p.ladder = 'legacy' ORDER BY a.id"
    ).fetchall()
    return rows, acts


conn = sqlite3.connect(DB)
before = legacy_snapshot(conn)

# Setup (staging only).
if conn.execute("SELECT COUNT(*) FROM people WHERE factory_role IS NOT NULL").fetchone()[0] == 0:
    first, second = [r[0] for r in conn.execute("SELECT id FROM people ORDER BY id LIMIT 2")]
    conn.commit()
    ok("people", "set-role", str(first), "owner")
    ok("people", "set-role", str(second), "agent")
people = {r["factory_role"]: r for r in ok("people", "list") if r["factory_role"]}
n = conn.execute("SELECT COUNT(*) FROM projects WHERE key LIKE 'PROOF%'").fetchone()[0] + 1
key = f"PROOF{n}"
conn.execute(
    "INSERT INTO projects (name, key, created_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    (f"SF-2 proof {n}", key),
)
pid = conn.execute("SELECT id FROM projects WHERE key = ?", (key,)).fetchone()[0]
sprint = conn.execute(
    "INSERT INTO sprints (project_id, name, goal, start_date, end_date, status)"
    " VALUES (?, 'Proof sprint', '', '2026-10-20', '2026-11-03', 'active') RETURNING id",
    (pid,),
).fetchone()[0]
conn.commit()
conn.close()

ok("project", "set", key, "--ladder", "factory", "--kind", "client")
ok("contact", "add", key, str(people["owner"]["id"]), "--primary")
print(f"--- project {key}, sprint {sprint}")

legacy_key = None
c = sqlite3.connect(DB)
row = c.execute(
    "SELECT p.key, t.task_number FROM tasks t JOIN projects p ON p.id = t.project_id"
    " WHERE p.ladder = 'legacy' AND t.type = 'story' LIMIT 1"
).fetchone()
c.close()
if row:
    legacy_key = f"{row[0]}-{row[1]}"
    refused("write to a legacy project's Story", "story", "move", legacy_key, "refining")
refused("create a Story on a legacy project", "story", "create", "MOB", "nope")

s = ok("--as", "owner", "story", "create", key, "Proof story", "--description", "SF-2 proof run")["key"]
check(f"{s} created in backlog", ok("story", "show", s)["status"] == "backlog")
refused("backlog -> building (skips Plan)", "story", "move", s, "building")
refused("legacy status on a Factory Story", "story", "move", s, "ready_for_development")

sub = ok("subtask", "create", s, "Build the thing", "--points", "3", "--risk")["key"]
ok("--as", "owner", "story", "move", s, "refining")
ok("--as", "owner", "story", "move", s, "ready")
refused("ready -> building outside a sprint", "story", "move", s, "building")
ok("story", "sprint", s, str(sprint))
ok("story", "branch", s, f"feat/{s}-proof")

st = ok("story", "move", s, "building")
check("building is the Agent's move", st["assignee"] == people["agent"]["name"])
ok("subtask", "handoff", sub, "--agent", "implementer", "--model", "claude-sonnet-5-5")
ok("subtask", "move", sub, "in_progress")
refused("building -> integrated_tests with an open Subtask", "story", "move", s, "integrated_tests")
ok("subtask", "verify", sub, "fail", "--reason", "tests red")
ok("subtask", "move", sub, "done")
ok("subtask", "verify", sub, "pass")
ok("review", s, "passed", "--commit", "abc1234")
ok("pr", "open", s, "https://github.com/pmattos87/flowboard/pull/999", "--target", "develop")
ok("pr", "merged", s, "https://github.com/pmattos87/flowboard/pull/999")

st = ok("story", "move", s, "integrated_tests")
check("integrated_tests is Pedro's move", st["assignee"] == people["owner"]["name"])
bug = ok("subtask", "create", s, "Button misaligned", "--bug")["key"]
check("bug Subtask flags the Story", ok("story", "show", s)["flags"]["waiting_on_bugs"] == 1)
refused("integrated_tests -> tested while a bug is open", "story", "move", s, "tested")
ok("story", "move", s, "building")
ok("subtask", "move", bug, "in_progress")
ok("subtask", "move", bug, "done")
ok("story", "move", s, "integrated_tests")
ok("--as", "owner", "story", "move", s, "tested")
refused("tested -> done on a Client project (skips user_testing)", "story", "move", s, "done")

ok("release", "create", key, "1.0.0")
ok("--as", "owner", "release", "pick", "1.0.0", s)
ok("release", "move", key, "1.0.0", "user_testing")
st = ok("--as", "owner", "story", "move", s, "user_testing")
check("user_testing is the primary contact's move", st["assignee"] == people["owner"]["name"])
st = ok("--as", "owner", "story", "move", s, "done")
check(f"{s} done", st["status"] == "done" and st["release"]["version"] == "1.0.0")
ok("release", "move", key, "1.0.0", "released")

trail = [e["action"] for e in ok("story", "trail", s)]
for a in ["created", "stage_entered", "subtask_status_changed", "subtask_handoff", "verify_round",
          "review_round", "pr_opened", "pr_merged", "bug_subtask_filed", "release_picked"]:
    check(f"trail has {a}", a in trail)

after = legacy_snapshot(sqlite3.connect(DB))
check(f"legacy tasks untouched ({len(before[0])} rows)", before[0] == after[0])
check(f"legacy activity untouched ({len(before[1])} rows)", before[1] == after[1])

print()
print("PROOF PASSED" if not failures else f"PROOF FAILED ({len(failures)}): {failures}")
sys.exit(1 if failures else 0)
