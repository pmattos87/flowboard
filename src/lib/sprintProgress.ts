import type { Task, TaskStatus } from "@/types";

export interface SprintCompletion {
  /** Story points in `done` (the only done status, on both ladders). */
  donePoints: number;
  /** Story points of every counted story: all statuses except `canceled`. */
  totalPoints: number;
  /** donePoints / totalPoints as an integer 0-100; 0 when totalPoints is 0. */
  percent: number;
  /** Points per status, canceled included (it is shown, but not counted in the total). */
  byStatus: Partial<Record<TaskStatus, number>>;
}

/**
 * Completion of a sprint row. Counts stories only (`type === "story"`), so bugs and
 * subtasks never double-count points; the helper filters itself, callers may pass a row's
 * tasks as they are.
 */
export function sprintCompletion(
  tasks: ReadonlyArray<Pick<Task, "type" | "status" | "story_points">>,
): SprintCompletion {
  const byStatus: SprintCompletion["byStatus"] = {};
  let donePoints = 0;
  let totalPoints = 0;
  for (const t of tasks) {
    if (t.type !== "story") continue;
    byStatus[t.status] = (byStatus[t.status] ?? 0) + t.story_points;
    if (t.status === "canceled") continue;
    totalPoints += t.story_points;
    if (t.status === "done") donePoints += t.story_points;
  }
  const percent = totalPoints === 0 ? 0 : Math.round((donePoints / totalPoints) * 100);
  return { donePoints, totalPoints, percent, byStatus };
}
