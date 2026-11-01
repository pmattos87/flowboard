import type { Task } from "@/types";

/** Splits a labels comma string into its labels, trimmed, with empties dropped (FB-99). */
export function parseLabels(labels: string | null | undefined): string[] {
  if (!labels) return [];
  return labels
    .split(",")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** True when no label filter is set, otherwise only when the task carries that exact label. */
export function matchesLabelFilter(task: Pick<Task, "labels">, filter: string | null): boolean {
  if (filter === null) return true;
  return parseLabels(task.labels).includes(filter);
}
