import { describe, it, expect } from "vitest";
import { runGraph, type RunGraph, type RunNode } from "@/features/story/runGraph";
import type { Task, TaskStatus, TrailEvent } from "@/types";

function task(over: Partial<Task>): Task {
  return {
    id: 1, project_id: 1, task_number: 1, sprint_id: 3, parent_id: null,
    title: "", description: "", type: "story", status: "backlog", priority: "medium",
    assignee_id: null, story_points: 0, due_date: null, created_at: "2026-10-01T10:00:00.000Z",
    updated_at: "", labels: "", feature_branch: null, review_verdict: null, reviewed_commit: null,
    findings_url: null, run_stopped: false, risk: false, release_id: null,
    ...over,
  };
}

const ev = (action: string, data: Record<string, unknown> | string = ""): TrailEvent => ({
  at: "2026-10-02T10:00:00.000Z", action, old: "", new: data, by: "Claude",
});
const stage = (s: TaskStatus) => ev("stage_entered", s);
const sub = (n: number, status: TaskStatus, type: Task["type"] = "task") =>
  task({ id: 100 + n, task_number: n, parent_id: 1, type, status });

function graph(story: Partial<Task>, subtasks: Task[], trail: TrailEvent[], clientProject = false): RunGraph {
  return runGraph({ story: task(story), subtasks, trail: [ev("created", "backlog"), ...trail], projectKey: "FB", clientProject });
}

const states = (nodes: RunNode[]) => Object.fromEntries(nodes.map((n) => [n.id, n.state]));

describe("runGraph", () => {
  it("before the Run starts, only Plan has progress", () => {
    const g = graph({ status: "backlog" }, [], []);
    expect(states(g.plan)).toEqual({ created: "done", brief: "todo", split: "todo", approve: "todo", start: "todo" });
    expect(g.orchestrator.state).toBe("todo");
    expect(g.ship.every((n) => n.state === "todo")).toBe(true);
  });

  it("a ready Story in a sprint waits on the Run start", () => {
    const g = graph({ status: "ready" }, [sub(2, "todo")], [stage("refining"), stage("ready")]);
    expect(states(g.plan)).toEqual({ created: "done", brief: "done", split: "done", approve: "done", start: "current" });
    expect(g.plan.find((n) => n.id === "split")?.caption).toBe("1 Subtask");
  });

  it("a Run stopped on Verify marks the failing Subtask, Verify and Stop", () => {
    const g = graph(
      { status: "building", run_stopped: true },
      [sub(2, "done"), sub(3, "in_progress"), sub(4, "todo")],
      [
        stage("refining"), stage("ready"), stage("building"),
        ev("subtask_handoff", { subtask: "FB-2", agent: "implementer", model: "sonnet" }),
        ev("verify_round", { subtask: "FB-2", round: 1, result: "pass" }),
        ev("verify_round", { subtask: "FB-3", round: 1, result: "fail" }),
        ev("verify_round", { subtask: "FB-3", round: 2, result: "fail" }),
        ev("run_stopped", { reason: "Verify failed twice on FB-3" }),
      ],
    );
    expect(g.plan.every((n) => n.state === "done")).toBe(true);
    expect(g.orchestrator.state).toBe("current");
    expect(g.subtasks.map((s) => [s.key, s.state])).toEqual([["FB-2", "done"], ["FB-3", "stopped"], ["FB-4", "todo"]]);
    expect(g.subtasks[0].info?.agent).toBe("implementer");
    expect(g.verify.state).toBe("stopped");
    expect(g.stop.state).toBe("stopped");
    expect(g.stop.caption).toBe("Verify failed twice on FB-3");
    expect(g.docs.state).toBe("todo");
    expect(g.ship[0].state).toBe("todo");
  });

  it("once every Subtask is done, Docs and then Review are the Run's place", () => {
    const g = graph({ status: "building" }, [sub(2, "done")], [stage("building"), ev("verify_round", { subtask: "FB-2", round: 1, result: "pass" })]);
    expect(g.verify.state).toBe("done");
    expect(g.docs.state).toBe("current");
  });

  it("a Review with findings loops through Fix, then integrates", () => {
    const g = graph(
      { status: "integrated_tests" },
      [sub(2, "done")],
      [
        stage("building"),
        ev("review_round", { round: 1, verdict: "failed" }),
        ev("review_round", { round: 2, verdict: "passed" }),
        ev("pr_opened", { url: "https://github.com/o/r/pull/7", target: "develop" }),
        ev("pr_merged", { url: "https://github.com/o/r/pull/7" }),
        stage("integrated_tests"),
      ],
    );
    expect(g.fix.state).toBe("done");
    expect(g.fix.caption).toContain("1 round with findings");
    expect(states(g.ship)).toEqual({ review: "done", pr: "done", merge: "done", integrated: "current", release: "todo", production: "todo" });
  });

  it("a failed Review round with the Run still going is Fix's turn", () => {
    const g = graph({ status: "building" }, [sub(2, "done")], [stage("building"), ev("review_round", { round: 1, verdict: "failed" })]);
    expect(g.ship[0].state).toBe("current");
    expect(g.fix.state).toBe("current");
    expect(g.docs.state).toBe("done");
  });

  it("a done Client Story has passed user testing and production", () => {
    const g = graph(
      { status: "done", release_id: 4 },
      [sub(2, "done")],
      [stage("building"), stage("integrated_tests"), stage("tested"), ev("release_picked", { version: "1.7.0" }), stage("user_testing"), stage("done")],
      true,
    );
    expect(states(g.ship)).toEqual({
      review: "done", pr: "done", merge: "done", integrated: "done", release: "done", user_testing: "done", production: "done",
    });
    expect(g.ship.find((n) => n.id === "release")?.caption).toBe("release 1.7.0");
  });

  it("Internal projects have no user testing node", () => {
    const g = graph({ status: "tested" }, [], [stage("tested")]);
    expect(g.ship.map((n) => n.id)).not.toContain("user_testing");
    expect(g.ship.find((n) => n.id === "release")?.state).toBe("current");
  });

  it("a bug sends the Story back to building without undoing what it passed", () => {
    const g = graph(
      { status: "building" },
      [sub(2, "done"), sub(3, "todo", "bug")],
      [stage("building"), stage("integrated_tests"), ev("bug_subtask_filed", { subtask: "FB-3" }), stage("building")],
    );
    expect(g.bugLoop).toBe(true);
    expect(g.ship.find((n) => n.id === "merge")?.state).toBe("done");
    expect(g.orchestrator.state).toBe("current");
  });

  it("a bug filed during Build is not the bug loop", () => {
    const g = graph(
      { status: "building" },
      [sub(2, "todo", "bug")],
      [stage("building"), ev("bug_subtask_filed", { subtask: "FB-2", title: "Review round 1 findings" })],
    );
    expect(g.bugLoop).toBe(false);
  });

  it("a restarted Run shows Stop as passed", () => {
    const g = graph({ status: "building" }, [], [stage("building"), ev("run_stopped", { reason: "x" }), ev("run_restarted")]);
    expect(g.stop.state).toBe("done");
    expect(g.stop.caption).toBe("stopped 1× · restarted");
  });
});
