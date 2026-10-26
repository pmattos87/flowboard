import type { Project, Task } from "@/types";

// On a Factory project a Story's points are the sum of its Subtasks' (SF-68),
// so the reports count Stories only; on a legacy project every task counts.
export function reportedTasks(tasks: Task[], ladder: Project["ladder"] | undefined): Task[] {
  return ladder === "factory" ? tasks.filter((t) => t.type === "story") : tasks;
}
