import { describe, it, expect } from "vitest";
import { runGraph, type NodeState, type RunGraph, type RunNode } from "@/features/story/runGraph";
import type { Task, TaskStatus, TrailEvent } from "@/types";

function task(over: Partial<Task>): Task {
  return {
    id: 1, project_id: 1, task_number: 1, sprint_id: 3, parent_id: null,
    title: "", description: "", type: "story", status: "backlog", priority: "medium",
    assignee_id: null, story_points: 0, due_date: null, created_at: "2026-10-01T10:00:00.000Z",
    updated_at: "", labels: "", feature_branch: null, review_verdict: null, reviewed_commit: null,
    findings_url: null, run_stopped: false, risk: false, release_id: null, epic_id: null,
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

describe("runGraph Review lit from review_started (FB-158)", () => {
  const built = [stage("building"), ev("verify_round", { subtask: "FB-2", round: 1, result: "pass" })];
  const started = (round: number) => ev("review_started", { round });
  const review = (g: RunGraph) => g.ship.find((n) => n.id === "review");

  it("a first round running: Docs is done and Code review is current", () => {
    const g = graph({ status: "building" }, [sub(2, "done")], [...built, started(1)]);
    expect(g.docs.state).toBe("done");
    expect(review(g)?.state).toBe("current");
    expect(review(g)?.caption).toBe("whole Story diff");
    expect(g.fix.state).toBe("todo");
  });

  it("without review_started, Docs is current and Code review is todo", () => {
    const g = graph({ status: "building" }, [sub(2, "done")], built);
    expect(g.docs.state).toBe("current");
    expect(review(g)?.state).toBe("todo");
  });

  it("a re-review after a failed round, a stop and a restart: Code review current, Fix findings done", () => {
    const g = graph({ status: "building" }, [sub(2, "done"), sub(3, "done", "bug")], [
      ...built, ev("review_round", { round: 1, verdict: "failed" }), ev("bug_subtask_filed", { subtask: "FB-3" }),
      ev("run_stopped", { reason: "Review waits: Codex unavailable" }), ev("run_restarted"), started(2),
    ]);
    expect(review(g)?.state).toBe("current");
    expect(g.fix.state).toBe("done");
  });

  it("a passed round is done until another round starts, which makes Code review current again", () => {
    const passed = [...built, started(1), ev("review_round", { round: 1, verdict: "passed" })];
    expect(review(graph({ status: "building" }, [sub(2, "done")], passed))?.state).toBe("done");
    expect(review(graph({ status: "building" }, [sub(2, "done")], [...passed, started(2)]))?.state).toBe("current");
  });

  it("Codex unavailable during a started round: Code review stops, from review", () => {
    const g = graph({ status: "building", run_stopped: true }, [sub(2, "done")], [
      ...built, started(1), ev("run_stopped", { reason: "Review waits: Codex unavailable" }),
    ]);
    expect(review(g)?.state).toBe("stopped");
    expect(g.reviewStopFrom).toBe("review");
    expect(g.docs.state).toBe("done");
  });

  it("a first pass's review_started does not make the second pass's Docs done", () => {
    const url = "https://github.com/o/r/pull/93";
    const g = graph({ status: "building" }, [sub(2, "done"), sub(3, "done", "bug")], [
      ...built, started(1), ev("review_round", { round: 1, verdict: "passed" }),
      ev("pr_opened", { url, target: "develop" }), ev("pr_merged", { url }),
      stage("integrated_tests"), ev("bug_subtask_filed", { subtask: "FB-3" }), stage("building"),
      ev("verify_round", { subtask: "FB-3", round: 1, result: "pass" }),
    ]);
    expect(g.bugLoop).toBe(true);
    expect(g.docs.state).toBe("current");
    expect(review(g)?.state).toBe("todo");
  });

  it("QA: a two-round first pass with review_started leaves the second pass's Docs current until its own round starts", () => {
    const url = "https://github.com/o/r/pull/93";
    const firstPass = [
      ...built, started(1), ev("review_round", { round: 1, verdict: "failed" }), started(2),
      ev("review_round", { round: 2, verdict: "passed" }),
      ev("pr_opened", { url, target: "develop" }), ev("pr_merged", { url }),
      stage("integrated_tests"), ev("bug_subtask_filed", { subtask: "FB-3" }), stage("building"),
      ev("verify_round", { subtask: "FB-3", round: 1, result: "pass" }),
    ];
    const done = [sub(2, "done"), sub(3, "done", "bug")];
    const before = graph({ status: "building" }, done, firstPass);
    expect(before.docs.state).toBe("current");
    expect(review(before)?.state).toBe("todo");
    expect(before.fix.state).toBe("todo");
    const after = graph({ status: "building" }, done, [...firstPass, started(3)]);
    expect(after.docs.state).toBe("done");
    expect(review(after)?.state).toBe("current");
  });

  it("QA: two failed rounds still stop from fix; a stop in a third running round stops from review", () => {
    const twoFailed = [
      ...built, started(1), ev("review_round", { round: 1, verdict: "failed" }),
      started(2), ev("review_round", { round: 2, verdict: "failed" }),
    ];
    const subs = [sub(2, "done")];
    const fixStop = graph({ status: "building", run_stopped: true }, subs, [...twoFailed, ev("run_stopped", { reason: "Review failed twice" })]);
    expect(fixStop.reviewStopFrom).toBe("fix");
    expect(g2(fixStop)).toEqual(["stopped", "stopped"]);
    const reviewStop = graph({ status: "building", run_stopped: true }, subs, [
      ...twoFailed, ev("run_stopped", { reason: "Review failed twice" }), ev("run_restarted"), started(3),
      ev("run_stopped", { reason: "Review waits: Codex unavailable" }),
    ]);
    expect(reviewStop.reviewStopFrom).toBe("review");
    expect(g2(reviewStop)).toEqual(["stopped", "done"]);
  });
  const g2 = (g: RunGraph) => [review(g)?.state, g.fix.state];

  it("a manual Review with an open Subtask stopped for Codex unavailable stops at the Review gate", () => {
    const subs = [sub(2, "done"), sub(3, "todo")];
    const g = graph({ status: "building", run_stopped: true }, subs, [
      ...built, started(1), ev("run_stopped", { reason: "Review waits: Codex unavailable" }),
    ]);
    expect(review(g)?.state).toBe("stopped");
    expect(g.reviewStopFrom).toBe("review");
    expect(g.reviewStop.state).toBe("stopped");
    expect(g.stop.state).toBe("todo");
  });

  it("a stop with an open Subtask and no running Review is still a Build stop", () => {
    const subs = [sub(2, "done"), sub(3, "todo")];
    const g = graph({ status: "building", run_stopped: true }, subs, [
      ...built, started(1), ev("review_round", { round: 1, verdict: "failed" }),
      ev("run_stopped", { reason: "Subtask FB-3 failed Verify twice" }),
    ]);
    expect(g.reviewStopFrom).toBeNull();
    expect(g.stop.state).toBe("stopped");
    expect(g.reviewStop.state).toBe("todo");
  });

  it("QA: a Verify stop with a stale review_started in the pass is a Build stop", () => {
    const subs = [sub(2, "done"), sub(3, "in_progress"), sub(4, "todo")];
    const g = graph({ status: "building", run_stopped: true }, subs, [
      ...built, started(1), ev("run_stopped", { reason: "Review waits: Codex unavailable" }), ev("run_restarted"),
      ev("subtask_handoff", { subtask: "FB-3", agent: "frontend-design", model: "opus" }),
      ev("verify_round", { subtask: "FB-3", round: 1, result: "fail" }),
      ev("verify_round", { subtask: "FB-3", round: 2, result: "fail" }),
      ev("run_stopped", { reason: "Verify failed twice on FB-3" }),
    ]);
    expect(g.verify.state).toBe("stopped");
    expect(g.reviewStopFrom).toBeNull();
    expect(g.stop.state).toBe("stopped");
    expect(g.reviewStop.state).toBe("done");
  });

  it("QA: a non-Verify stop while building an open Subtask after a stale review_started is a Build stop", () => {
    const subs = [sub(2, "done"), sub(3, "done"), sub(4, "in_progress")];
    const g = graph({ status: "building", run_stopped: true }, subs, [
      ...built, started(1), ev("run_stopped", { reason: "Review waits: Codex unavailable" }), ev("run_restarted"),
      ev("subtask_handoff", { subtask: "FB-3", agent: "frontend-design", model: "opus" }),
      ev("verify_round", { subtask: "FB-3", round: 1, result: "pass" }),
      ev("subtask_handoff", { subtask: "FB-4", agent: "frontend-design", model: "opus" }),
      ev("run_stopped", { reason: "Builder blocked on FB-4: needs a decision" }),
    ]);
    expect(g.reviewStopFrom).toBeNull();
    expect(g.stop.state).toBe("stopped");
    expect(g.reviewStop.state).toBe("done");
  });

  it("QA: a second manual Review round started after Build work, stopped for Codex unavailable with an open Subtask, stops at the Review gate", () => {
    const subs = [sub(2, "done"), sub(3, "done", "bug"), sub(4, "todo")];
    const g = graph({ status: "building", run_stopped: true }, subs, [
      ...built, started(1), ev("review_round", { round: 1, verdict: "failed" }),
      ev("subtask_handoff", { subtask: "FB-3", agent: "frontend-design", model: "opus" }),
      ev("verify_round", { subtask: "FB-3", round: 1, result: "pass" }),
      started(2), ev("run_stopped", { reason: "Review waits: Codex unavailable" }),
    ]);
    expect(review(g)?.state).toBe("stopped");
    expect(g.reviewStopFrom).toBe("review");
    expect(g.reviewStop.state).toBe("stopped");
    expect(g.stop.state).toBe("todo");
  });

  it("B1: a manual Review started after a Verify stop and a restart, stopped for Codex unavailable, stops at the Review gate", () => {
    const subs = [sub(2, "done"), sub(3, "in_progress")];
    const g = graph({ status: "building", run_stopped: true }, subs, [
      ...built,
      ev("subtask_handoff", { subtask: "FB-3", agent: "frontend-design", model: "opus" }),
      ev("verify_round", { subtask: "FB-3", round: 1, result: "fail" }),
      ev("run_stopped", { reason: "Verify failed on FB-3" }), ev("run_restarted"),
      started(1), ev("run_stopped", { reason: "Review waits: Codex unavailable" }),
    ]);
    expect(review(g)?.state).toBe("stopped");
    expect(g.reviewStopFrom).toBe("review");
    expect(g.reviewStop.state).toBe("stopped");
    expect(g.stop.state).not.toBe("stopped");
    expect(g.verify.state).not.toBe("stopped");
    expect(g.subtasks.find((n) => n.key === "FB-3")?.state).toBe("current");
  });

  it("a failed Verify after a review_started still makes the stop a Build stop", () => {
    const subs = [sub(2, "done"), sub(3, "in_progress")];
    const g = graph({ status: "building", run_stopped: true }, subs, [
      ...built, started(1),
      ev("verify_round", { subtask: "FB-3", round: 1, result: "fail" }),
      ev("run_stopped", { reason: "Verify failed on FB-3" }),
    ]);
    expect(g.reviewStopFrom).toBeNull();
    expect(g.stop.state).toBe("stopped");
    expect(g.reviewStop.state).toBe("todo");
    expect(g.subtasks.find((n) => n.key === "FB-3")?.state).toBe("stopped");
    expect(review(g)?.state).not.toBe("stopped");
  });

  it("QA node-state: a review_started with no verdict followed by Build work leaves Code review not current", () => {
    const subs = [sub(2, "done"), sub(3, "in_progress")];
    const g = graph({ status: "building" }, subs, [
      ...built, started(1),
      ev("subtask_handoff", { subtask: "FB-3", agent: "frontend-design", model: "opus" }),
    ]);
    expect(review(g)?.state).not.toBe("current");
    expect(g.subtasks.find((n) => n.key === "FB-3")?.state).toBe("current");
  });
});

describe("runGraph one in-flight rule (FB-245, QA)", () => {
  const built = [stage("building"), ev("verify_round", { subtask: "FB-2", round: 1, result: "pass" })];
  const started = (round: number) => ev("review_started", { round });
  const review = (g: RunGraph) => g.ship.find((n) => n.id === "review");

  it("B1 restarted: the Verify stop counts on the Build gate, the Codex stop on the Review gate", () => {
    const g = graph({ status: "building" }, [sub(2, "done"), sub(3, "in_progress")], [
      ...built,
      ev("subtask_handoff", { subtask: "FB-3", agent: "frontend-design", model: "opus" }),
      ev("verify_round", { subtask: "FB-3", round: 1, result: "fail" }),
      ev("run_stopped", { reason: "Verify failed on FB-3" }), ev("run_restarted"),
      started(1), ev("run_stopped", { reason: "Review waits: Codex unavailable" }), ev("run_restarted"),
    ]);
    expect(g.stop.state).toBe("done");
    expect(g.stop.caption).toBe("stopped 1× · restarted");
    expect(g.reviewStop.state).toBe("done");
    expect(g.reviewStop.caption).toBe("stopped 1× · restarted");
    expect(g.subtasks.find((n) => n.key === "FB-3")?.state).toBe("current");
  });

  it("a review_started overtaken by a handoff leaves Code review and Fix findings todo, Docs done", () => {
    const g = graph({ status: "building" }, [sub(2, "done"), sub(3, "in_progress")], [
      ...built, started(1),
      ev("subtask_handoff", { subtask: "FB-3", agent: "frontend-design", model: "opus" }),
    ]);
    expect(review(g)?.state).toBe("todo");
    expect(g.fix.state).toBe("todo");
    expect(g.docs.state).toBe("done");
  });

  it("a re-review started then overtaken by fix work makes Fix findings current again, not done", () => {
    const g = graph({ status: "building" }, [sub(2, "done"), sub(3, "in_progress", "bug")], [
      ...built, ev("review_round", { round: 1, verdict: "failed" }), ev("bug_subtask_filed", { subtask: "FB-3" }),
      started(2), ev("subtask_handoff", { subtask: "FB-3", agent: "frontend-design", model: "opus" }),
    ]);
    expect(g.fix.state).toBe("current");
    expect(review(g)?.state).toBe("todo");
  });

  it("B2: a re-review started then overtaken by a verify_round leaves Code review todo and Fix findings current", () => {
    const g = graph({ status: "building" }, [sub(2, "done"), sub(3, "in_progress", "bug")], [
      ...built, ev("review_round", { round: 1, verdict: "failed" }), ev("bug_subtask_filed", { subtask: "FB-3" }),
      started(2), ev("verify_round", { subtask: "FB-3", round: 1, result: "pass" }),
    ]);
    expect(review(g)?.state).toBe("todo");
    expect(g.fix.state).toBe("current");
  });

  it("FB-276: the findings bug Subtask handed out after a failed round turns Code review todo, with or without a review_started", () => {
    const subs = [sub(2, "done"), sub(3, "in_progress", "bug")];
    const failed = [ev("review_round", { round: 1, verdict: "failed" }), ev("bug_subtask_filed", { subtask: "FB-3" })];
    const handoff = ev("subtask_handoff", { subtask: "FB-3", agent: "frontend-design", model: "opus" });
    for (const trail of [[...built, ...failed, handoff], [...built, started(1), ...failed, handoff]]) {
      const g = graph({ status: "building" }, subs, trail);
      expect(review(g)?.state).toBe("todo");
      expect(g.fix.state).toBe("current");
      expect(g.subtasks.find((n) => n.key === "FB-3")?.state).toBe("current");
    }
  });

  it("FB-276: a verify_round of the bug Subtask after a failed round turns Code review todo", () => {
    const subs = [sub(2, "done"), sub(3, "in_progress", "bug")];
    const failed = [ev("review_round", { round: 1, verdict: "failed" }), ev("bug_subtask_filed", { subtask: "FB-3" })];
    const verify = ev("verify_round", { subtask: "FB-3", round: 1, result: "pass" });
    for (const trail of [[...built, ...failed, verify], [...built, started(1), ...failed, verify]]) {
      const g = graph({ status: "building" }, subs, trail);
      expect(review(g)?.state).toBe("todo");
      expect(g.fix.state).toBe("current");
    }
  });

  it("FB-276: a failed round with no Build work after it keeps Code review current", () => {
    const subs = [sub(2, "done"), sub(3, "todo", "bug")];
    const failed = ev("review_round", { round: 1, verdict: "failed" });
    const filed = ev("bug_subtask_filed", { subtask: "FB-3" });
    const tails: [string, TrailEvent[]][] = [
      ["nothing", []],
      ["bug_subtask_filed alone", [filed]],
      ["run_stopped", [ev("run_stopped", { reason: "Pedro paused the Run" })]],
      ["run_restarted", [ev("run_restarted")]],
    ];
    for (const [name, tail] of tails) {
      for (const before of [[], [started(1)]]) {
        const g = graph({ status: "building" }, subs, [...built, ...before, failed, ...tail]);
        expect(review(g)?.state, `${name}, review_started before: ${before.length > 0}`).toBe("current");
        expect(g.fix.state, name).toBe("current");
      }
    }
  });

  it("a review_started overtaken by a failed Verify, then a stop: the Subtask and Build gate stop", () => {
    const g = graph({ status: "building", run_stopped: true }, [sub(2, "done"), sub(3, "in_progress")], [
      ...built, started(1),
      ev("subtask_handoff", { subtask: "FB-3", agent: "frontend-design", model: "opus" }),
      ev("verify_round", { subtask: "FB-3", round: 1, result: "fail" }),
      ev("verify_round", { subtask: "FB-3", round: 2, result: "fail" }),
      ev("run_stopped", { reason: "Verify failed twice on FB-3" }),
    ]);
    expect(g.subtasks.find((n) => n.key === "FB-3")?.state).toBe("stopped");
    expect(g.verify.state).toBe("stopped");
    expect(g.stop.state).toBe("stopped");
    expect(g.reviewStop.state).toBe("todo");
    expect(g.reviewStopFrom).toBeNull();
    expect(review(g)?.state).toBe("todo");
  });

  it("no review_started: a passed round while integrating and a Verify stop render as before", () => {
    const passed = graph({ status: "building" }, [sub(2, "done")], [...built, ev("review_round", { round: 1, verdict: "passed" }),
      ev("pr_opened", { url: "u", target: "develop" })]);
    expect(review(passed)?.state).toBe("done");
    expect(passed.fix.state).toBe("todo");
    const stoppedG = graph({ status: "building", run_stopped: true }, [sub(2, "in_progress")], [
      stage("building"), ev("verify_round", { subtask: "FB-2", round: 1, result: "fail" }),
      ev("verify_round", { subtask: "FB-2", round: 2, result: "fail" }), ev("run_stopped", { reason: "Verify failed twice on FB-2" }),
    ]);
    expect(stoppedG.subtasks[0].state).toBe("stopped");
    expect(stoppedG.stop.state).toBe("stopped");
    expect(review(stoppedG)?.state).toBe("todo");
  });
});

describe("runGraph overtaken review_started never lights Code review (FB-246, QA)", () => {
  const built = [stage("building"), ev("verify_round", { subtask: "FB-2", round: 1, result: "pass" })];
  const started = (round: number) => ev("review_started", { round });
  const review = (g: RunGraph) => g.ship.find((n) => n.id === "review");
  const handoff = ev("subtask_handoff", { subtask: "FB-3", agent: "frontend-design", model: "opus" });

  it("a passed round, then a review_started overtaken by Build work: Code review is done, not current", () => {
    const g = graph({ status: "building" }, [sub(2, "done"), sub(3, "in_progress")], [
      ...built, started(1), ev("review_round", { round: 1, verdict: "passed" }), started(2), handoff,
    ]);
    expect(review(g)?.state).toBe("done");
  });

  it("a failed round, an overtaken re-review, then a Build stop: Code review is not current or stopped", () => {
    const g = graph({ status: "building", run_stopped: true }, [sub(2, "done"), sub(3, "in_progress", "bug")], [
      ...built, ev("review_round", { round: 1, verdict: "failed" }), ev("bug_subtask_filed", { subtask: "FB-3" }),
      started(2), handoff,
      ev("verify_round", { subtask: "FB-3", round: 1, result: "fail" }),
      ev("verify_round", { subtask: "FB-3", round: 2, result: "fail" }),
      ev("run_stopped", { reason: "Verify failed twice on FB-3" }),
    ]);
    expect(review(g)?.state).toBe("todo");
    expect(g.stop.state).toBe("stopped");
    expect(g.reviewStopFrom).toBeNull();
  });

  it("a failed round, an overtaken re-review, then the re-review started again: Code review is current", () => {
    const g = graph({ status: "building" }, [sub(2, "done"), sub(3, "done", "bug")], [
      ...built, ev("review_round", { round: 1, verdict: "failed" }), ev("bug_subtask_filed", { subtask: "FB-3" }),
      started(2), handoff, ev("verify_round", { subtask: "FB-3", round: 1, result: "pass" }), started(2),
    ]);
    expect(review(g)?.state).toBe("current");
    expect(g.fix.state).toBe("done");
  });
});

describe("runGraph Subtask roles (FB-171)", () => {
  it("gives each Subtask its role: Simplify by title, bug by type, the rest from the plan", () => {
    const g = graph({ status: "building" }, [
      sub(2, "done"),
      task({ id: 103, task_number: 3, parent_id: 1, type: "subtask", status: "todo", title: "Simplify" }),
      sub(4, "todo", "bug"),
    ], [stage("building")]);
    expect(g.subtasks.map((s) => [s.key, s.role])).toEqual([["FB-2", "subtask"], ["FB-3", "simplify"], ["FB-4", "bug"]]);
  });
});

describe("runGraph Verify lit from verify_started (FB-277)", () => {
  const handoff = ev("subtask_handoff", { subtask: "FB-2", agent: "frontend-design", model: "opus" });
  const started = (round: number) => ev("verify_started", { subtask: "FB-2", round });
  const round = (n: number, result: "pass" | "fail") => ev("verify_round", { subtask: "FB-2", round: n, result });

  it("a handoff then verify_started: Verify and the Subtask under it are current", () => {
    const g = graph({ status: "building" }, [sub(2, "in_progress"), sub(3, "todo")], [stage("building"), handoff, started(1)]);
    expect(g.verify.state).toBe("current");
    expect(g.subtasks.map((s) => [s.key, s.state])).toEqual([["FB-2", "current"], ["FB-3", "todo"]]);
  });

  it("round 2 starting after a failed round 1 lights Verify again", () => {
    const g = graph({ status: "building" }, [sub(2, "in_progress")], [stage("building"), handoff, started(1), round(1, "fail"), started(2)]);
    expect(g.verify.state).toBe("current");
    expect(g.subtasks.map((s) => s.state)).toEqual(["current"]);
  });

  it("a failed verify_round ends it: Verify is not current", () => {
    const g = graph({ status: "building" }, [sub(2, "in_progress")], [stage("building"), handoff, started(1), round(1, "fail")]);
    expect(g.verify.state).not.toBe("current");
  });

  it("a passing verify_round ends it: Verify is not current", () => {
    const g = graph({ status: "building" }, [sub(2, "done"), sub(3, "todo")], [stage("building"), handoff, started(1), round(1, "pass")]);
    expect(g.verify.state).not.toBe("current");
  });

  it("a new subtask_handoff after verify_started: Verify is not current", () => {
    const g = graph({ status: "building" }, [sub(2, "in_progress")], [stage("building"), handoff, started(1), handoff]);
    expect(g.verify.state).not.toBe("current");
  });

  it("a review_started after verify_started: Verify is not current", () => {
    const g = graph({ status: "building" }, [sub(2, "done")], [stage("building"), handoff, started(1), ev("review_started", { round: 1 })]);
    expect(g.verify.state).not.toBe("current");
  });

  it("a stop while Verify is in flight is a Build stop; Verify is neither stopped nor current", () => {
    const g = graph({ status: "building", run_stopped: true }, [sub(2, "in_progress")], [
      stage("building"), handoff, started(1), ev("run_stopped", { reason: "QA blocked" }),
    ]);
    expect(g.stop.state).toBe("stopped");
    expect(g.reviewStop.state).not.toBe("stopped");
    expect(g.verify.state).not.toBe("stopped");
    expect(g.verify.state).not.toBe("current");
  });

  it("a stop after a failed verify_round, round 2 having started, stops Verify", () => {
    const g = graph({ status: "building", run_stopped: true }, [sub(2, "in_progress")], [
      stage("building"), handoff, started(1), round(1, "fail"), started(2), round(2, "fail"),
      ev("run_stopped", { reason: "Verify failed twice on FB-2" }),
    ]);
    expect(g.stop.state).toBe("stopped");
    expect(g.reviewStop.state).not.toBe("stopped");
    expect(g.verify.state).toBe("stopped");
  });

  it("a finished Build never shows Verify current, even with verify_started latest", () => {
    const g = graph({ status: "building" }, [sub(2, "done")], [stage("building"), handoff, started(1)]);
    expect(g.verify.state).toBe("done");
  });
});
