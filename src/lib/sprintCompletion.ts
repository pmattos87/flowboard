import type { Project, Sprint, Task, TaskStatus } from "@/types";

/** Unfinished = not `done` and not `canceled`, on both ladders (what `complete_sprint` moves). */
export function isUnfinished(status: TaskStatus): boolean {
  return status !== "done" && status !== "canceled";
}

/**
 * The sprints `complete_sprint` can carry issues into: the project's not-completed sprints
 * other than `source`, earliest `start_date` first.
 */
export function openSprintsFor(sprints: ReadonlyArray<Sprint>, source: Sprint): Sprint[] {
  return sprints
    .filter((s) => s.id !== source.id && s.project_id === source.project_id && s.status !== "completed")
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id - b.id);
}

/** The default destination: the earliest of `openSprintsFor`, or null when none is left. */
export function nextSprint(sprints: ReadonlyArray<Sprint>, source: Sprint): Sprint | null {
  return openSprintsFor(sprints, source)[0] ?? null;
}

function localDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Whole local calendar days since `endDate` (YYYY-MM-DD); 0 when it is today or later. */
export function daysOverdue(endDate: string, today: Date = new Date()): number {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  // Round, not floor: a DST shift makes a calendar day 23 or 25 hours long.
  return Math.max(0, Math.round((t - localDay(endDate)) / 86_400_000));
}

type Row = Pick<Task, "id" | "sprint_id" | "parent_id" | "type" | "status" | "task_number">;

const keyOf = (projectKey: string, t: Row) => `${projectKey}-${t.task_number}`;

/**
 * Why Backlog is not offered when completing `sprintId`, or null when it is. Only Factory
 * projects refuse: a Story leaves a sprint only at `ready`, so every unfinished top-level
 * Story in the sprint must be at `ready`. Mirrors the backend's refusal text.
 */
export function backlogBlockReason(
  project: Pick<Project, "key" | "ladder">,
  tasks: ReadonlyArray<Row>,
  sprintId: number,
): string | null {
  if (project.ladder !== "factory") return null;
  const blocking = tasks.filter(
    (t) =>
      t.sprint_id === sprintId &&
      t.type === "story" &&
      t.parent_id === null &&
      isUnfinished(t.status) &&
      t.status !== "ready",
  );
  if (blocking.length === 0) return null;
  const list = blocking.map((t) => `${keyOf(project.key, t)} is ${t.status}`).join(", ");
  return `a Story enters or leaves a sprint only at ready; ${list}`;
}

export interface DoneStoryWithOpenSubtasks {
  story: string;
  subtasks: string[];
}

/**
 * Done Stories in `sprintId` that still have unfinished child rows, each with those
 * children's keys. Children are looked up across all of `tasks`, wherever their sprint,
 * as the backend does. Empty when completion is not blocked.
 */
export function openSubtasksUnderDoneStories(
  projectKey: string,
  tasks: ReadonlyArray<Row>,
  sprintId: number,
): DoneStoryWithOpenSubtasks[] {
  const byNumber = (a: Row, b: Row) => a.task_number - b.task_number;
  return tasks
    .filter((s) => s.sprint_id === sprintId && s.type === "story" && s.status === "done")
    .sort(byNumber)
    .map((s) => ({
      story: keyOf(projectKey, s),
      subtasks: tasks
        .filter((c) => c.parent_id === s.id && isUnfinished(c.status))
        .sort(byNumber)
        .map((c) => keyOf(projectKey, c)),
    }))
    .filter((r) => r.subtasks.length > 0);
}
