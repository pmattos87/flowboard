import { describe, it, expect } from "vitest";
import { runGraph, type NodeState, type RunGraph, type RunNode } from "@/features/story/runGraph";
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
const sub = (n: number, status: TaskStatus, type: Task["type"] = "subtask") =>
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

  it("names the integrated-tests gate \"Integrated tests\"", () => {
    const g = graph({ status: "integrated_tests" }, [], [stage("integrated_tests")]);
    expect(g.ship.find((n) => n.id === "integrated")?.title).toBe("Integrated tests");
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
    expect(g.ship.find((n) => n.id === "merge")?.state).not.toBe("done");
    expect(g.orchestrator.state).toBe("current");
  });

  it("a bug loop with no pr_opened events does not keep the first pass's checks", () => {
    const g = graph(
      { status: "building" },
      [sub(2, "done"), sub(3, "in_progress", "bug")],
      [stage("building"), stage("integrated_tests"), ev("bug_subtask_filed", { subtask: "FB-3" }), stage("building")],
    );
    expect(g.bugLoop).toBe(true);
    expect(g.verify.state).not.toBe("done");
    expect(g.docs.state).not.toBe("done");
    expect(g.ship.find((n) => n.id === "review")?.state).not.toBe("done");
    expect(g.ship.find((n) => n.id === "pr")?.state).not.toBe("done");
    expect(g.ship.find((n) => n.id === "merge")?.state).not.toBe("done");
  });

  it("a bug filed during Build is not the bug loop", () => {
    const g = graph(
      { status: "building" },
      [sub(2, "todo", "bug")],
      [stage("building"), ev("bug_subtask_filed", { subtask: "FB-2", title: "Review round 1 findings" })],
    );
    expect(g.bugLoop).toBe(false);
  });

  it("after a restart the reworked Subtask, not Verify, is current", () => {
    const g = graph(
      { status: "building" },
      [sub(2, "in_progress")],
      [
        stage("building"),
        ev("verify_round", { subtask: "FB-2", round: 1, result: "fail" }),
        ev("verify_round", { subtask: "FB-2", round: 2, result: "fail" }),
        ev("run_stopped", { reason: "x" }),
        ev("run_restarted"),
      ],
    );
    expect(g.subtasks[0].state).toBe("current");
    expect(g.verify.state).toBe("todo");
  });

  it("a restarted Run shows Stop as passed", () => {
    const g = graph({ status: "building" }, [], [stage("building"), ev("run_stopped", { reason: "x" }), ev("run_restarted")]);
    expect(g.stop.state).toBe("done");
    expect(g.stop.caption).toBe("stopped 1× · restarted");
  });
});

describe("runGraph Review lane Stop gate (FB-174)", () => {
  const built = [stage("building"), ev("verify_round", { subtask: "FB-2", round: 1, result: "pass" })];
  const failed = (round: number) => ev("review_round", { round, verdict: "failed" });

  it("Review failed twice: the Review gate stops with the reason, from Fix findings; the Build gate does not", () => {
    const g = graph({ status: "building", run_stopped: true }, [sub(2, "done"), sub(3, "done", "bug")], [
      ...built, failed(1), ev("bug_subtask_filed", { subtask: "FB-3" }), ev("verify_round", { subtask: "FB-3", round: 1, result: "pass" }),
      failed(2), ev("run_stopped", { reason: "Review failed twice" }),
    ]);
    expect(g.reviewStop.state).toBe("stopped");
    expect(g.reviewStop.caption).toBe("Review failed twice");
    expect(g.reviewStopFrom).toBe("fix");
    expect(g.fix.state).toBe("stopped");
    expect(g.stop.state).toBe("todo");
    expect(g.verify.state).toBe("done");
  });

  it("Integrate failed after a passed Review: Auto-merge stops, Code review and Fix findings do not", () => {
    const g = graph({ status: "building", run_stopped: true }, [sub(2, "done")], [
      ...built, ev("review_round", { round: 1, verdict: "passed" }),
      ev("pr_opened", { url: "https://github.com/o/r/pull/9", target: "develop" }),
      ev("run_stopped", { reason: "Integrate: a PR check failed" }),
    ]);
    expect(g.reviewStopFrom).toBe("merge");
    expect(states(g.ship)).toMatchObject({ review: "done", pr: "done", merge: "stopped" });
    expect(g.fix.state).toBe("todo");
    expect(g.reviewStop.state).toBe("stopped");
    expect(g.stop.state).toBe("todo");
  });

  it("Codex unavailable before any Review round: Code review stops, Fix findings does not", () => {
    const g = graph({ status: "building", run_stopped: true }, [sub(2, "done")], [
      ...built, ev("run_stopped", { reason: "Review waits: Codex unavailable" }),
    ]);
    expect(g.reviewStopFrom).toBe("review");
    expect(g.ship[0].state).toBe("stopped");
    expect(g.fix.state).toBe("todo");
    expect(g.reviewStop.state).toBe("stopped");
    expect(g.stop.state).toBe("todo");
  });

  it("Codex unavailable after one failed round: Code review stops, Fix findings is done, not stopped", () => {
    const g = graph({ status: "building", run_stopped: true }, [sub(2, "done"), sub(3, "done", "bug")], [
      ...built, failed(1), ev("bug_subtask_filed", { subtask: "FB-3" }), ev("verify_round", { subtask: "FB-3", round: 1, result: "pass" }),
      ev("run_stopped", { reason: "Review waits: Codex unavailable" }),
    ]);
    expect(g.reviewStopFrom).toBe("review");
    expect(g.ship[0].state).toBe("stopped");
    expect(g.fix.state).toBe("done");
    expect(g.reviewStop.state).toBe("stopped");
  });

  it("a Subtask failed Verify twice: the Build gate stops; the Review gate stays todo", () => {
    const g = graph({ status: "building", run_stopped: true }, [sub(2, "in_progress")], [
      stage("building"),
      ev("verify_round", { subtask: "FB-2", round: 1, result: "fail" }),
      ev("verify_round", { subtask: "FB-2", round: 2, result: "fail" }),
      ev("run_stopped", { reason: "Verify failed twice on FB-2" }),
    ]);
    expect(g.stop.state).toBe("stopped");
    expect(g.stop.caption).toBe("Verify failed twice on FB-2");
    expect(g.verify.state).toBe("stopped");
    expect(g.reviewStop.state).toBe("todo");
    expect(g.reviewStopFrom).toBeNull();
    expect(g.ship[0].state).toBe("todo");
  });

  it("the Review findings' bug Subtask failing Verify twice stops at the Build gate, and counts there after a restart", () => {
    const trail = [
      ...built, failed(1), ev("bug_subtask_filed", { subtask: "FB-3" }),
      ev("verify_round", { subtask: "FB-3", round: 1, result: "fail" }),
      ev("verify_round", { subtask: "FB-3", round: 2, result: "fail" }),
      ev("run_stopped", { reason: "FB-3: Verify failed twice" }),
    ];
    const g = graph({ status: "building", run_stopped: true }, [sub(2, "done"), sub(3, "in_progress", "bug")], trail);
    expect(g.stop.state).toBe("stopped");
    expect(g.verify.state).toBe("stopped");
    expect(g.reviewStop.state).toBe("todo");
    expect(g.reviewStopFrom).toBeNull();
    expect(g.ship[0].state).not.toBe("stopped");
    expect(g.fix.state).not.toBe("stopped");
    const restarted = graph({ status: "building" }, [sub(2, "done"), sub(3, "in_progress", "bug")], [...trail, ev("run_restarted")]);
    expect(restarted.stop.caption).toBe("stopped 1× · restarted");
    expect(restarted.reviewStop.state).toBe("todo");
  });

  it("a blocked builder (open Subtask, no failed Verify) stops at the Build gate", () => {
    const g = graph({ status: "building", run_stopped: true }, [sub(2, "in_progress")], [stage("building"), ev("run_stopped", { reason: "Builder blocked" })]);
    expect(g.stop.state).toBe("stopped");
    expect(g.reviewStop.state).toBe("todo");
  });

  it("restarted after a Review-side stop: the Review gate counts it, the Build gate is untouched", () => {
    const g = graph({ status: "building" }, [sub(2, "done"), sub(3, "in_progress", "bug")], [
      ...built, failed(1), ev("bug_subtask_filed", { subtask: "FB-3" }), failed(2),
      ev("run_stopped", { reason: "Review failed twice" }), ev("run_restarted"),
    ]);
    expect(g.reviewStop.state).toBe("done");
    expect(g.reviewStop.caption).toBe("stopped 1× · restarted");
    expect(g.stop.state).toBe("todo");
    expect(g.stop.caption).toBe("fails twice");
  });

  it("restarted after a Build stop: the Build gate counts it, the Review gate is untouched", () => {
    const g = graph({ status: "building" }, [sub(2, "in_progress")], [
      stage("building"),
      ev("verify_round", { subtask: "FB-2", round: 1, result: "fail" }),
      ev("verify_round", { subtask: "FB-2", round: 2, result: "fail" }),
      ev("run_stopped", { reason: "Verify failed twice on FB-2" }), ev("run_restarted"),
    ]);
    expect(g.stop.state).toBe("done");
    expect(g.stop.caption).toBe("stopped 1× · restarted");
    expect(g.reviewStop.state).toBe("todo");
  });

  it("classifies past stops by a \"Review \" reason or a Review round just before, else Build", () => {
    const g = graph({ status: "building" }, [sub(2, "done")], [
      ...built,
      // Reason names Review, though the last step was a Verify round.
      ev("run_stopped", { reason: "Review waits: Codex unavailable" }), ev("run_restarted"),
      // An Integrate stop: no "Review " reason, but a passed Review round just before.
      ev("review_round", { round: 1, verdict: "passed" }), ev("run_stopped", { reason: "Integrate: merge conflict" }), ev("run_restarted"),
      // A bug Subtask filed after the round makes the next stop Build-side.
      ev("bug_subtask_filed", { subtask: "FB-3" }), ev("run_stopped", { reason: "Builder blocked" }), ev("run_restarted"),
    ]);
    expect(g.reviewStop.caption).toBe("stopped 2× · restarted");
    expect(g.stop.caption).toBe("stopped 1× · restarted");
  });

  it("the current stop is placed by the graph and not counted among the past ones", () => {
    const g = graph({ status: "building", run_stopped: true }, [sub(2, "done")], [
      ...built, ev("run_stopped", { reason: "Verify failed twice" }), ev("run_restarted"),
      // Text says nothing of Review, but the Build is finished: Review-side.
      ev("run_stopped", { reason: "Codex did not answer" }),
    ]);
    expect(g.reviewStop.state).toBe("stopped");
    expect(g.reviewStop.caption).toBe("Codex did not answer");
    expect(g.stop.state).toBe("done");
    expect(g.stop.caption).toBe("stopped 1× · restarted");
  });
});

describe("runGraph second pass after a bug loop (FB-176)", () => {
  const url1 = "https://github.com/o/r/pull/93";
  const url2 = "https://github.com/o/r/pull/100";
  const firstPass = [
    stage("building"), ev("verify_round", { subtask: "FB-2", round: 1, result: "pass" }),
    ev("review_round", { round: 1, verdict: "failed" }), ev("review_round", { round: 2, verdict: "passed" }),
    ev("pr_opened", { url: url1, target: "develop" }), ev("pr_merged", { url: url1 }),
    stage("integrated_tests"), ev("bug_subtask_filed", { subtask: "FB-3" }), stage("building"),
  ];
  const secondBuilt = [ev("verify_round", { subtask: "FB-3", round: 1, result: "pass" })];
  const prOpen2 = ev("pr_opened", { url: url2, target: "develop" });
  const passed = ev("review_round", { round: 3, verdict: "passed" });
  const done = [sub(2, "done"), sub(3, "done", "bug")];
  const ids = (g: RunGraph): Record<string, NodeState> => ({ ...states(g.ship), verify: g.verify.state, docs: g.docs.state });

  it("second PR open and not merged: Auto-merge is the current node", () => {
    const g = graph({ status: "building" }, done, [...firstPass, ...secondBuilt, passed, prOpen2]);
    const s = ids(g);
    expect(s.merge).toBe("current");
    expect([s.pr, s.review, s.docs, s.verify]).toEqual(["done", "done", "done", "done"]);
    expect(g.bugLoop).toBe(true);
    expect([g.orchestrator, g.verify, g.docs, ...g.ship].filter((n) => n.state === "current").length).toBeGreaterThan(1);
  });

  it("second PR merged and back in integrated tests: Auto-merge done, Integrated tests current", () => {
    const g = graph({ status: "integrated_tests" }, done, [
      ...firstPass, ...secondBuilt, passed, prOpen2, ev("pr_merged", { url: url2 }), stage("integrated_tests"),
    ]);
    const s = ids(g);
    expect(s.merge).toBe("done");
    expect(s.integrated).toBe("current");
  });

  it("bug Subtask in progress: nothing past Build is done from the first pass", () => {
    const g = graph({ status: "building" }, [sub(2, "done"), sub(3, "in_progress", "bug")], firstPass);
    const s = ids(g);
    for (const id of ["verify", "docs", "review", "pr", "merge"] as const) expect(s[id]).not.toBe("done");
    expect(g.fix.state).not.toBe("done");
  });

  it("a failed Review round in the second pass shows as on a first pass, counting that pass only", () => {
    const g = graph({ status: "building" }, done, [...firstPass, ...secondBuilt, ev("review_round", { round: 3, verdict: "failed" })]);
    expect(g.ship[0].state).toBe("current");
    expect(g.ship[0].caption).toBe("round 1 · failed");
    expect(g.fix.state).toBe("current");
    expect(g.fix.caption).toBe("1 round with findings · max 2");
  });

  it("a Review-side stop in the second pass lands on the Review gate, with max 2 counted per pass", () => {
    const failed = ev("review_round", { round: 3, verdict: "failed" });
    const one = graph({ status: "building", run_stopped: true }, done, [
      ...firstPass, ...secondBuilt, failed, ev("run_stopped", { reason: "Codex did not answer" }),
    ]);
    expect(one.reviewStop.state).toBe("stopped");
    expect(one.reviewStopFrom).toBe("review");
    expect(one.stop.state).not.toBe("stopped");
    const two = graph({ status: "building", run_stopped: true }, done, [
      ...firstPass, ...secondBuilt, failed, ev("review_round", { round: 4, verdict: "failed" }), ev("run_stopped", { reason: "Review failed twice" }),
    ]);
    expect(two.reviewStopFrom).toBe("fix");
    expect(two.reviewStop.state).toBe("stopped");
    expect(two.stop.state).not.toBe("stopped");
  });

  it("second pass Review passed, no second PR yet: the first pass's merged PR does not light PR opened or Auto-merge", () => {
    const g = graph({ status: "building" }, done, [...firstPass, ...secondBuilt, passed]);
    const s = ids(g);
    expect(s.review).toBe("done");
    expect(s.pr).toBe("todo");
    expect(s.merge).toBe("todo");
  });

  it("second pass Build finished, no Review round yet: Docs is current, Code review and PR are not done", () => {
    const g = graph({ status: "building" }, done, [...firstPass, ...secondBuilt]);
    const s = ids(g);
    expect(s.verify).toBe("done");
    expect(s.docs).toBe("current");
    expect(s.review).toBe("todo");
    expect(g.fix.state).toBe("todo");
    expect(s.pr).toBe("todo");
    expect(s.merge).toBe("todo");
  });

  it("an Integrate stop on the second PR lands on the Review gate from merge", () => {
    const g = graph({ status: "building", run_stopped: true }, done, [
      ...firstPass, ...secondBuilt, passed, prOpen2, ev("run_stopped", { reason: "Integrate failed: checks red" }),
    ]);
    expect(g.reviewStopFrom).toBe("merge");
    expect(g.ship.find((n) => n.id === "merge")?.state).toBe("stopped");
  });

  it("past stops from the first pass still count on the Stop gates in the second pass", () => {
    const g = graph({ status: "building" }, [sub(2, "done"), sub(3, "in_progress", "bug")], [
      stage("building"), ev("verify_round", { subtask: "FB-2", round: 1, result: "fail" }),
      ev("run_stopped", { reason: "Verify failed twice on FB-2" }), ev("run_restarted"),
      ...firstPass.slice(1),
    ]);
    expect(g.stop.caption).toBe("stopped 1× · restarted");
  });

  it("PR opened counts the PRs into develop across passes", () => {
    const two = graph({ status: "building" }, done, [...firstPass, ...secondBuilt, passed, prOpen2]);
    expect(two.ship.find((n) => n.id === "pr")?.caption).toBe("2 PRs · PR gate: Review passed");
    const one = graph({ status: "building" }, [sub(2, "done")], [stage("building"), ev("pr_opened", { url: url1, target: "develop" })]);
    expect(one.ship.find((n) => n.id === "pr")?.caption).toBe("PR gate: Review passed");
  });
});
