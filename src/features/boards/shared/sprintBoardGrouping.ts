import type { Sprint, SprintStatus, Task } from "@/types";
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

  const backlogRow: SprintBoardRow = {
    key: "backlog",
    sprint: null,
    tasks: sortByPriority(stories.filter((t) => t.sprint_id === null)),
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

/**
 * Decide the patch + optimistic override for a Sprint Planning Board drop.
 * Dropping onto a sprint sets the story's `sprint_id`; dropping onto Backlog
 * clears it. Returns `null` when the story is already in the target section.
 */
export function computeSprintDropPayload(
  task: Task,
  targetKey: SprintBoardRowKey,
): { payload: { sprint_id: number | null }; override: { sprint_id: number | null } } | null {
  const newSprintId = targetKey === "backlog" ? null : targetKey;
  if (task.sprint_id === newSprintId) return null;
  return { payload: { sprint_id: newSprintId }, override: { sprint_id: newSprintId } };
}
