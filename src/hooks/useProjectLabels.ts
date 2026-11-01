import { useQuery } from "@tanstack/react-query";
import { listTasks } from "@/lib/commands";
import { parseLabels } from "@/lib/labels";
import { taskKeys } from "@/hooks/useTasks";
import type { Task } from "@/types";

/** Case-insensitive A–Z, ties broken by the exact text (the backend's label order, FB-213). */
function compareLabels(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function distinctLabels(tasks: Task[], projectId: number): string[] {
  const set = new Set<string>();
  for (const t of tasks) {
    if (t.project_id !== projectId) continue;
    for (const l of parseLabels(t.labels)) set.add(l);
  }
  return [...set].sort(compareLabels);
}

/**
 * The distinct labels used by one project's tasks (FB-99). Shares the cache of
 * `useTasks({ project_id })`, so any task mutation that invalidates `taskKeys.all` refreshes it.
 */
export function useProjectLabels(projectId: number | null | undefined) {
  return useQuery({
    queryKey: taskKeys.list({ project_id: projectId ?? -1 }),
    queryFn: () => listTasks({ project_id: projectId as number }),
    enabled: projectId != null,
    select: (tasks: Task[]) => distinctLabels(tasks, projectId as number),
  });
}
