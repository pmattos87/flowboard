import type { Project, Task } from "@/types";
import { isStoryLevel } from "@/lib/storyLevel";

// On a Factory project a Story's points are the sum of its Subtasks' (SF-68),
// so the reports count Stories only (bug Stories included, FB-52); on a legacy
// project every task counts.
export function reportedTasks(tasks: Task[], ladder: Project["ladder"] | undefined): Task[] {
  return ladder === "factory" ? tasks.filter((t) => isStoryLevel(t, ladder)) : tasks;
}
