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

interface SprintDropPatch {
  sprint_id: number | null;
  status?: TaskStatus;
}

/**
 * FB-85: a story may only be scheduled into a sprint once it reaches
 * "Ready for Development". Applies only to backlog -> sprint moves — moving a
 * story between sprints or back to the backlog is always allowed.
 */
export function isSprintScheduleBlocked(task: Task, targetKey: SprintBoardRowKey): boolean {
  return (
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
 * the sprint's dev workflow. Sprint->sprint and ->backlog moves leave status.
 */
export function computeSprintDropPayload(
  task: Task,
  targetKey: SprintBoardRowKey,
): { payload: SprintDropPatch; override: SprintDropPatch } | null {
  const newSprintId = targetKey === "backlog" ? null : targetKey;
  if (task.sprint_id === newSprintId) return null;

  const patch: SprintDropPatch = { sprint_id: newSprintId };
  if (task.sprint_id === null && newSprintId !== null) {
    patch.status = "todo";
  }
  return { payload: patch, override: patch };
}
