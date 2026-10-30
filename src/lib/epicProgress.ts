import type { Task } from "@/types";
import { isStoryLevel } from "@/lib/storyLevel";

export interface EpicProgress {
  /** Story counts per stage: building = building + integrated_tests; tested = tested + user_testing. */
  stages: { building: number; tested: number; done: number };
  /** The n of "n/m tested": Stories at tested, user_testing or done. */
  tested: number;
  /** The m of "n/m tested": every Story of the epic except canceled ones. */
  total: number;
  /** Sum of story_points of the Stories not done or canceled. */
  pointsLeft: number;
}

/**
 * Progress of a Factory epic (FB-224), derived from its Stories, never entered.
 * Counts the Story-level rows whose `epic_id` is the epic, scheduled or not;
 * callers may pass a whole project's tasks. Discovery-stage Stories
 * (backlog / refining / ready) count in `total` only.
 */
export function epicProgress(
  epicId: number,
  tasks: ReadonlyArray<Pick<Task, "type" | "parent_id" | "status" | "story_points" | "epic_id">>,
): EpicProgress {
  const stages = { building: 0, tested: 0, done: 0 };
  let total = 0;
  let pointsLeft = 0;
  for (const t of tasks) {
    if (t.epic_id !== epicId || !isStoryLevel(t, "factory")) continue;
    if (t.status === "canceled") continue;
    total += 1;
    if (t.status === "done") {
      stages.done += 1;
      continue;
    }
    pointsLeft += t.story_points;
    if (t.status === "building" || t.status === "integrated_tests") stages.building += 1;
    else if (t.status === "tested" || t.status === "user_testing") stages.tested += 1;
  }
  return { stages, tested: stages.tested + stages.done, total, pointsLeft };
}
