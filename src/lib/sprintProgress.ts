import type { Project, Task, TaskStatus } from "@/types";
import { isStoryLevel } from "@/lib/storyLevel";

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
 * Completion of a sprint row. Counts Stories only (`isStoryLevel`), so bug Subtasks and
 * subtasks never double-count points; the helper filters itself, callers may pass a row's
 * tasks as they are. On a Factory project a top-level bug is a Story and counts (FB-52).
 */
export function sprintCompletion(
  tasks: ReadonlyArray<Pick<Task, "type" | "parent_id" | "status" | "story_points">>,
  ladder: Project["ladder"] = "legacy",
): SprintCompletion {
  const byStatus: SprintCompletion["byStatus"] = {};
  let donePoints = 0;
  let totalPoints = 0;
  for (const t of tasks) {
    if (!isStoryLevel(t, ladder)) continue;
    byStatus[t.status] = (byStatus[t.status] ?? 0) + t.story_points;
    if (t.status === "canceled") continue;
    totalPoints += t.story_points;
    if (t.status === "done") donePoints += t.story_points;
  }
  const percent = totalPoints === 0 ? 0 : Math.round((donePoints / totalPoints) * 100);
  return { donePoints, totalPoints, percent, byStatus };
}
