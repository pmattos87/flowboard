import type { Task, TaskStatus, TrailEvent } from "@/types";
import { isSubtaskStopped, subtaskRunInfo, type SubtaskRunInfo } from "./subtaskRun";

// The state of every node of a Story's Run graph (SF-62), derived from the
// Story, its Subtasks and its trail. Pure, so the graph only draws.

/** done, current (the Run is here now), stopped, or not reached yet. */
export type NodeState = "done" | "current" | "stopped" | "todo";

export type NodeKind = "trigger" | "design" | "gate" | "flowboard" | "agent" | "git" | "review" | "skill";

export interface RunNode {
  id: string;
  title: string;
  kind: NodeKind;
  caption: string;
  state: NodeState;
}

export interface SubtaskNode {
  id: string;
  key: string;
  title: string;
  state: NodeState;
  info: SubtaskRunInfo | undefined;
}

export interface RunGraph {
  plan: RunNode[];
  orchestrator: RunNode;
  subtasks: SubtaskNode[];
  verify: RunNode;
  /** The Build lane's Stop gate: a Subtask failed Verify twice, a blocked builder, a merge failure. */
  stop: RunNode;
  /** The Review lane's Stop gate: Review failed twice, Codex unavailable, or Integrate failed. */
  reviewStop: RunNode;
  /** Which node's edge carries a Review-side stop into `reviewStop`, or null. */
  reviewStopFrom: "review" | "fix" | "merge" | null;
  docs: RunNode;
  /** Review → Integrate → Release → Production, in order. */
  ship: RunNode[];
  fix: RunNode;
  /** A bug Subtask was filed from integrated tests or later: the loop back to Build is live. */
  bugLoop: boolean;
}

const LADDER: TaskStatus[] = ["backlog", "refining", "ready", "building", "integrated_tests", "tested", "user_testing", "done"];
const rank = (s: string) => LADDER.indexOf(s as TaskStatus);

function obj(e: TrailEvent): Record<string, unknown> {
  return typeof e.new === "object" ? e.new : {};
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function shortDate(at: string): string {
  if (!at) return "";
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Whether a bug Subtask was filed while the Story sat in integrated tests or
 * later. Bug Subtasks filed during Build (Review findings among them) are the
 * findings loop or ordinary rework, not the bug loop.
 */
function bugFoundAfterIntegrate(trail: TrailEvent[]): boolean {
  let stage = "backlog";
  for (const e of trail) {
    if (e.action === "stage_entered") stage = str(e.new);
    else if (e.action === "bug_subtask_filed" && rank(stage) >= rank("integrated_tests")) return true;
  }
  return false;
}

export interface RunGraphInput {
  story: Task;
  subtasks: Task[];
  trail: TrailEvent[];
  projectKey: string;
  clientProject: boolean;
}

export function runGraph({ story, subtasks, trail, projectKey, clientProject }: RunGraphInput): RunGraph {
  const status = story.status;
  const stopped = story.run_stopped;
  // The furthest Stage the Story ever reached: a bug Subtask sends it back to
  // building, but what it passed stays passed.
  const reachedRank = Math.max(
    rank(status),
    ...trail.filter((e) => e.action === "stage_entered").map((e) => rank(str(e.new))),
  );
  const reached = (s: TaskStatus) => reachedRank >= rank(s);
  const at = (s: TaskStatus) => trail.filter((e) => e.action === "stage_entered" && e.new === s).at(-1)?.at ?? "";
  const pick = (done: boolean, current: boolean): NodeState => (done ? "done" : current ? "current" : "todo");

  // ─── Plan ───
  const created = trail.find((e) => e.action === "created");
  const plan: RunNode[] = [
    { id: "created", title: "Story created", kind: "flowboard", caption: `backlog · ${shortDate(created?.at ?? story.created_at)}`, state: "done" },
    { id: "brief", title: "Brief written", kind: "design", caption: "refining", state: pick(reached("ready"), status === "refining") },
    {
      id: "split",
      title: "Task splitter",
      kind: "agent",
      caption: subtasks.length > 0 ? `${subtasks.length} Subtask${subtasks.length === 1 ? "" : "s"}` : "no Subtasks yet",
      state: pick(subtasks.length > 0, status === "refining"),
    },
    { id: "approve", title: "Pedro approves", kind: "gate", caption: reached("ready") ? `→ ready · ${shortDate(at("ready"))}` : "→ ready", state: pick(reached("ready"), false) },
    {
      id: "start",
      title: "Run started",
      kind: "trigger",
      caption: reached("building") ? `→ building · ${shortDate(at("building"))}` : "ready and in a sprint",
      state: pick(reached("building"), status === "ready"),
    },
  ];

  // ─── Build ───
  const info = subtaskRunInfo(trail);
  const open = subtasks.filter((s) => s.status !== "done" && s.status !== "canceled");
  const building = status === "building";
  const subNodes: SubtaskNode[] = subtasks.map((s) => {
    const key = `${projectKey}-${s.task_number}`;
    const run = info[key];
    const state: NodeState = isSubtaskStopped(stopped, run)
      ? "stopped"
      : s.status === "done"
        ? "done"
        : s.status === "in_progress"
          ? "current"
          : "todo";
    return { id: `sub-${s.id}`, key, title: s.title, state, info: run };
  });
  const buildStopped = stopped && subNodes.some((n) => n.state === "stopped");
  // A stop after the Build finished (every Subtask done or canceled, none
  // stopped) is Review-side: it waits at the Review lane's gate.
  const reviewSide = stopped && !buildStopped && open.length === 0;
  const reviewRounds = trail.filter((e) => e.action === "review_round");
  const buildFinished = reached("integrated_tests") || reviewRounds.length > 0 || (building && open.length === 0 && subtasks.length > 0);

  const orchestrator: RunNode = {
    id: "orchestrator",
    title: "Orchestrator",
    kind: "agent",
    caption: "hands each Subtask out",
    state: pick(reached("building") && !building, building),
  };
  const verify: RunNode = {
    id: "verify",
    title: "Verify",
    kind: "agent",
    caption: "QA · tsc · tests",
    // The Subtasks show where the Build is; Verify only shows its outcome.
    state: buildStopped ? "stopped" : pick(buildFinished, false),
  };
  // Each gate counts its own past stops. A past stop is Review-side when its
  // reason names Review, or when the last Review round / Verify round / bug
  // Subtask before it was a Review round (Integrate stops follow a passed one).
  // The current stop's side comes from the graph, not the trail.
  const pastStops: ("build" | "review")[] = [];
  let lastStep = "";
  for (const e of trail) {
    if (e.action === "review_round" || e.action === "verify_round" || e.action === "bug_subtask_filed") lastStep = e.action;
    else if (e.action === "run_stopped")
      pastStops.push(str(obj(e).reason).startsWith("Review ") || lastStep === "review_round" ? "review" : "build");
  }
  const lastStop = trail.filter((e) => e.action === "run_stopped").at(-1);
  if (stopped) pastStops.pop();
  const gate = (id: string, here: boolean, side: "build" | "review", idle: string): RunNode => {
    const n = pastStops.filter((s) => s === side).length;
    return {
      id,
      title: "Stop, tell Pedro",
      kind: "gate",
      caption: here ? (lastStop && str(obj(lastStop).reason)) || "Run stopped" : n > 0 ? `stopped ${n}× · restarted` : idle,
      state: here ? "stopped" : n > 0 ? "done" : "todo",
    };
  };
  const stop = gate("stop", stopped && !reviewSide, "build", "fails twice");
  const reviewStop = gate("stop-review", reviewSide, "review", "Review or Integrate fails");
  const docs: RunNode = {
    id: "docs",
    title: "Docs",
    kind: "agent",
    caption: "once per Story",
    state: pick(reached("integrated_tests") || reviewRounds.length > 0, building && open.length === 0 && subtasks.length > 0 && !stopped),
  };

  // ─── Review → Integrate → Release → Production ───
  const lastReview = reviewRounds.at(-1);
  const lastVerdict = lastReview ? str(obj(lastReview).verdict) : "";
  const failedRounds = reviewRounds.filter((e) => str(obj(e).verdict) === "failed").length;
  // Which node a Review-side stop came from: Integrate failed after a passed
  // Review, Review failed twice, or else Codex was unavailable.
  const reviewStopFrom: RunGraph["reviewStopFrom"] = !reviewSide
    ? null
    : lastVerdict === "passed"
      ? "merge"
      : failedRounds >= 2 && lastVerdict === "failed"
        ? "fix"
        : "review";
  const review: RunNode = {
    id: "review",
    title: "Code review",
    kind: "review",
    caption: reviewRounds.length > 0 ? `round ${reviewRounds.length} · ${lastVerdict}` : "whole Story diff",
    state:
      reviewStopFrom === "review" || reviewStopFrom === "fix"
        ? "stopped"
        : lastVerdict === "passed" || reached("integrated_tests")
          ? "done"
          : pick(false, lastVerdict === "failed" || (docs.state === "done" && building)),
  };
  const fix: RunNode = {
    id: "fix",
    title: "Fix findings",
    kind: "review",
    caption: failedRounds > 0 ? `${failedRounds} round${failedRounds === 1 ? "" : "s"} with findings · max 2` : "then re-review · max 2 rounds",
    state:
      reviewStopFrom === "fix"
        ? "stopped"
        : failedRounds === 0
          ? "todo"
          : lastVerdict === "passed" || reached("integrated_tests") || reviewStopFrom === "review"
            ? "done"
            : "current",
  };
  const developPrs = trail.filter((e) => e.action === "pr_opened" && str(obj(e).target) === "develop");
  const merged = new Set(trail.filter((e) => e.action === "pr_merged").map((e) => str(obj(e).url)));
  const prOpened = developPrs.length > 0 || reached("integrated_tests");
  const prMerged = developPrs.some((e) => merged.has(str(obj(e).url))) || reached("integrated_tests");
  const picks = trail.filter((e) => e.action === "release_picked" || e.action === "release_removed");
  const lastPick = picks.at(-1);
  const picked = story.release_id != null || lastPick?.action === "release_picked";
  const version = lastPick && lastPick.action === "release_picked" ? str(obj(lastPick).version) : "";

  const ship: RunNode[] = [
    review,
    { id: "pr", title: "PR opened", kind: "git", caption: "PR gate: Review passed", state: pick(prOpened, false) },
    { id: "merge", title: "Auto-merge → develop", kind: "git", caption: "Integrate", state: reviewStopFrom === "merge" ? "stopped" : pick(prMerged, prOpened && !prMerged) },
    {
      id: "integrated",
      title: "Integrated tests",
      kind: "gate",
      caption: "Pedro tests on develop",
      state: pick(reached("tested"), status === "integrated_tests"),
    },
    {
      id: "release",
      title: "Picked into Release",
      kind: "flowboard",
      caption: version ? `release ${version}` : "tested → release/vX.Y.Z",
      state: pick(picked || reached("user_testing") || status === "done", status === "tested"),
    },
    ...(clientProject
      ? [{ id: "user_testing", title: "User testing", kind: "trigger" as const, caption: "client contact", state: pick(status === "done", status === "user_testing") }]
      : []),
    { id: "production", title: "Production", kind: "skill", caption: "release → main · done", state: pick(status === "done", false) },
  ];

  return {
    plan,
    orchestrator,
    subtasks: subNodes,
    verify,
    stop,
    reviewStop,
    reviewStopFrom,
    docs,
    ship,
    fix,
    bugLoop: bugFoundAfterIntegrate(trail),
  };
}
