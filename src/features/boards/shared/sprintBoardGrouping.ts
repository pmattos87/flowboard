import type { Sprint, Task } from "@/types";
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
 * Output: ordered list of rows. One row per sprint matching the filter
 * (highest-priority stories first), followed by a `Backlog` row for stories
 * with no sprint. The Backlog row is always present and always last so it sits
 * at the bottom of the board.
 *
 * Only stories (`type === "story"`) are planned here; tasks/bugs are excluded.
 * Filter semantics:
 *   - "all"      → every sprint as its own row, then Backlog.
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

  return [...sprintRows, backlogRow];
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
