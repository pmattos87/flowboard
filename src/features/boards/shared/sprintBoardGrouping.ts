import type { Sprint, SprintStatus, Task, TaskStatus } from "@/types";
import type { SprintFilter } from "@/stores/uiStore";
import { sortByPriority } from "./boardConstants";

export type SprintBoardRowKey = number | "backlog";

export interface SprintBoardRow {
  key: SprintBoardRowKey;
  sprint: Sprint | null;
  tasks: Task[];
}

/**
 * Pure grouping reducer for the merged Sprint Planning Board.
 *
 * Output: ordered list of rows (highest-priority stories first within each).
 * Sprint sections are ordered by status so the board reads top-to-bottom as:
 *   active sprint(s) → sprints in backlog → Backlog (unscheduled) → completed.
 * Within a status group, backlog sprints sort by start date ascending (soonest
 * first) and completed sprints descending (most recent first).
 *
 * Only stories (`type === "story"`) are planned here; tasks/bugs are excluded.
 * Filter semantics:
 *   - "all"      → every sprint, status-ordered, with the Backlog row in place.
 *   - <sprintId> → just that sprint, then Backlog.
 *   - "backlog"  → only the Backlog row.
 */
export function buildSprintBoardRows(
  tasks: Task[],
  sprints: Sprint[],
  filter: SprintFilter,
): SprintBoardRow[] {
  const stories = tasks.filter((t) => t.type === "story");

  const visibleSprints =
    filter === "backlog"
      ? []
      : sprints.filter((s) => filter === "all" || filter === s.id);

  const sprintRows: SprintBoardRow[] = visibleSprints.map((sprint) => ({
    key: sprint.id,
    sprint,
    tasks: sortByPriority(stories.filter((t) => t.sprint_id === sprint.id)),
  }));

  // FB-85: only stories that reached "Ready for Development" are plannable, so
  // the backlog row shows exactly those. Stories already in a sprint keep showing
  // in their sprint row regardless of their (dev-workflow) status.
  const backlogRow: SprintBoardRow = {
    key: "backlog",
    sprint: null,
    tasks: sortByPriority(
      stories.filter((t) => t.sprint_id === null && t.status === "ready_for_development"),
    ),
  };

  const byStatus = (status: SprintStatus) =>
    sprintRows.filter((r) => r.sprint?.status === status);

  const active = byStatus("active");
  const backlogSprints = byStatus("backlog").sort((a, b) =>
    a.sprint!.start_date.localeCompare(b.sprint!.start_date),
  );
  const completed = byStatus("completed").sort((a, b) =>
    b.sprint!.start_date.localeCompare(a.sprint!.start_date),
  );

  return [...active, ...backlogSprints, backlogRow, ...completed];
}

// `backlog` | `sprint:<id>` — drop zone id format for the Sprint Planning Board.
export function sprintDroppableId(key: SprintBoardRowKey): string {
  return key === "backlog" ? "backlog" : `sprint:${key}`;
}

export function parseSprintDroppableId(id: string): SprintBoardRowKey | null {
  if (id === "backlog") return "backlog";
  if (id.startsWith("sprint:")) {
    const n = Number(id.slice("sprint:".length));
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

export interface SprintDropPatch {
  sprint_id: number | null;
  status?: TaskStatus;
}

// FB-90: one message for every sprint-assignment path — board DnD, the detail
// panel dropdown and the create modal all surface the same toast.
export const SPRINT_GATE_TOAST = {
  title: "Only stories marked “Ready for Development” can be added to a sprint",
  description: "Move it through the Discovery board first.",
} as const;

/**
 * FB-85: a story may only be scheduled into a sprint once it reaches
 * "Ready for Development". Applies only to backlog -> sprint moves — moving a
 * story between sprints or back to the backlog is always allowed.
 *
 * FB-90: gated on `type === "story"`. Tasks, bugs and epics never enter the
 * discovery lifecycle, so without this check they could never be put in a
 * sprint at all from the detail panel or create modal. The Sprint Planning
 * Board already filters to stories, so the check is a no-op for its drops.
 *
 * Takes only the fields it reads so the create modal can check an unsaved draft.
 */
export function isSprintScheduleBlocked(
  task: Pick<Task, "type" | "status" | "sprint_id">,
  targetKey: SprintBoardRowKey,
): boolean {
  return (
    task.type === "story" &&
    targetKey !== "backlog" &&
    task.sprint_id === null &&
    task.status !== "ready_for_development"
  );
}

/**
 * Decide the patch + optimistic override for a Sprint Planning Board drop.
 * Dropping onto a sprint sets the story's `sprint_id`; dropping onto Backlog
 * clears it. Returns `null` when the story is already in the target section.
 *
 * FB-85: scheduling a story out of the backlog (`sprint_id` null -> a sprint)
 * also resets its status to `todo`, moving it from the discovery lifecycle into
 * the sprint's dev workflow.
 *
 * Unscheduling (a sprint -> `sprint_id` null) is the inverse and restores
 * `ready_for_development`. Without it the story keeps its dev-workflow status
 * and the unscheduled row — which lists only `ready_for_development` — drops it
 * on the floor, so a story dragged into a sprint and straight back out would
 * vanish from the board. Sprint->sprint moves leave status alone.
 *
 * The status transitions apply to stories only: they move a row between the
 * discovery and dev lifecycles, and tasks/bugs/epics live solely in the dev one.
 * Resetting a half-finished bug to `todo` because it joined a sprint — or worse,
 * stamping it `ready_for_development` on the way out — would be wrong. The
 * planning board only ever feeds this stories, so the check is a no-op there;
 * the detail panel's sprint picker relies on it.
 */
export function computeSprintDropPayload(
  task: Pick<Task, "type" | "status" | "sprint_id">,
  targetKey: SprintBoardRowKey,
): { payload: SprintDropPatch; override: SprintDropPatch } | null {
  const newSprintId = targetKey === "backlog" ? null : targetKey;
  if (task.sprint_id === newSprintId) return null;

  const patch: SprintDropPatch = { sprint_id: newSprintId };
  if (task.type === "story") {
    if (task.sprint_id === null && newSprintId !== null) {
      patch.status = "todo";
    } else if (task.sprint_id !== null && newSprintId === null) {
      patch.status = "ready_for_development";
    }
  }
  return { payload: patch, override: patch };
}
