import type { Sprint, Task } from "@/types";
import type { SprintFilter } from "@/stores/uiStore";

export function matchesSprintFilter(task: Task, filter: SprintFilter): boolean {
  if (filter === "all") return true;
  if (filter === "backlog") return task.sprint_id === null;
  return task.sprint_id === filter;
}

export function sprintFilterLabel(
  filter: SprintFilter,
  sprints: Sprint[] | undefined,
): string {
  if (filter === "all") return "All sprints";
  if (filter === "backlog") return "Backlog";
  const s = sprints?.find((x) => x.id === filter);
  return s?.name ?? "Sprint";
}
