import type { Task, TaskStatus } from "@/types";
import type { SprintFilter } from "@/stores/uiStore";
import { matchesSprintFilter } from "./sprintFilter";

export type StoryGroupKey = number | "unparented";

export interface TaskBoardRow {
  key: StoryGroupKey;
  story: Task | null;
  children: Task[];
}

/**
 * Pure grouping reducer for the Task Board.
 *
 * Output: ordered list of rows. Each row is a story (matching the sprint filter)
 * with its task/bug children, followed by an optional `Unparented` pseudo-row
 * for tasks/bugs with `parent_id === null` that also match the filter.
 *
 * Stories are first-class rows — included even when they have zero children.
 * The `Unparented` row is omitted entirely when empty.
 */
export function buildTaskBoardRows(
  tasks: Task[],
  filter: SprintFilter,
): TaskBoardRow[] {
  const stories = tasks
    .filter((t) => t.type === "story")
    .filter((t) => matchesSprintFilter(t, filter))
    .sort((a, b) => a.id - b.id);

  const children = tasks.filter((t) => t.type === "task" || t.type === "bug");

  const rows: TaskBoardRow[] = stories.map((story) => ({
    key: story.id,
    story,
    children: children
      .filter((c) => c.parent_id === story.id)
      .filter((c) => matchesSprintFilter(c, filter)),
  }));

  const unparented = children
    .filter((c) => c.parent_id === null)
    .filter((c) => matchesSprintFilter(c, filter));

  if (unparented.length > 0) {
    rows.push({ key: "unparented", story: null, children: unparented });
  }

  return rows;
}

export function progressOf(children: Task[]): { done: number; total: number } {
  const total = children.length;
  const done = children.filter((c) => c.status === "done").length;
  return { done, total };
}

// `${status}:${groupKey}` — drop zone id format used by all groups on the Task Board.
export function droppableId(status: TaskStatus, group: StoryGroupKey): string {
  return `${status}:${group}`;
}

export function parseDroppableId(
  id: string,
): { status: TaskStatus; group: StoryGroupKey } | null {
  const idx = id.indexOf(":");
  if (idx === -1) return null;
  const status = id.slice(0, idx) as TaskStatus;
  const groupRaw = id.slice(idx + 1);
  const group: StoryGroupKey =
    groupRaw === "unparented" ? "unparented" : Number(groupRaw);
  if (group !== "unparented" && Number.isNaN(group)) return null;
  return { status, group };
}

/**
 * Decide the patch + optimistic override for a Task Board drop.
 *
 * `target` is the parsed droppable id (column + group). The new parent comes
 * from the group key; when joining a story the child inherits that story's
 * `sprint_id` so parent and child never diverge across sprints.
 *
 * Returns `null` when the drop is a no-op (same status, same parent, same
 * sprint). When non-null, every field present in `payload` is also present in
 * `override` so the UI repositions immediately.
 */
export function computeDropPayload(
  task: Task,
  target: { status: TaskStatus; group: StoryGroupKey },
  allTasks: Task[],
): {
  payload: {
    status?: TaskStatus;
    parent_id?: number | null;
    sprint_id?: number | null;
  };
  override: {
    status?: TaskStatus;
    parent_id?: number | null;
    sprint_id?: number | null;
  };
} | null {
  const newParentId: number | null =
    target.group === "unparented" ? null : target.group;
  const newParent =
    newParentId != null ? allTasks.find((t) => t.id === newParentId) ?? null : null;
  const newSprintId = newParent ? newParent.sprint_id : task.sprint_id;

  const sameStatus = task.status === target.status;
  const sameParent = task.parent_id === newParentId;
  const sameSprint = task.sprint_id === newSprintId;
  if (sameStatus && sameParent && sameSprint) return null;

  const payload: {
    status?: TaskStatus;
    parent_id?: number | null;
    sprint_id?: number | null;
  } = {};
  if (!sameStatus) payload.status = target.status;
  if (!sameParent) payload.parent_id = newParentId;
  if (!sameSprint) payload.sprint_id = newSprintId;

  return { payload, override: { ...payload } };
}
