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
  stop: RunNode;
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
  const stopEvents = trail.filter((e) => e.action === "run_stopped");
  const lastStop = stopEvents.at(-1);
  const stop: RunNode = {
    id: "stop",
    title: "Stop, tell Pedro",
    kind: "gate",
    caption: stopped
      ? (lastStop && str(obj(lastStop).reason)) || "Run stopped"
      : stopEvents.length > 0
        ? `stopped ${stopEvents.length}× · restarted`
        : "fails twice",
    state: stopped ? "stopped" : stopEvents.length > 0 ? "done" : "todo",
  };
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
  const review: RunNode = {
    id: "review",
    title: "Code review",
    kind: "review",
    caption: reviewRounds.length > 0 ? `round ${reviewRounds.length} · ${lastVerdict}` : "whole Story diff",
    state:
      lastVerdict === "passed" || reached("integrated_tests")
        ? "done"
        : lastVerdict === "failed" && stopped
          ? "stopped"
          : pick(false, lastVerdict === "failed" || (docs.state === "done" && building)),
  };
  const fix: RunNode = {
    id: "fix",
    title: "Fix findings",
    kind: "review",
    caption: failedRounds > 0 ? `${failedRounds} round${failedRounds === 1 ? "" : "s"} with findings · max 2` : "then re-review · max 2 rounds",
    state:
      failedRounds === 0
        ? "todo"
        : lastVerdict === "passed" || reached("integrated_tests")
          ? "done"
          : stopped
            ? "stopped"
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
    { id: "merge", title: "Auto-merge → develop", kind: "git", caption: "Integrate", state: pick(prMerged, prOpened && !prMerged) },
    {
      id: "integrated",
      title: "In integrated tests",
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
    docs,
    ship,
    fix,
    bugLoop: bugFoundAfterIntegrate(trail),
  };
}
