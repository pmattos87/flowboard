import type { Task } from "@/types";
import { isStoryLevel } from "@/lib/storyLevel";
import { FACTORY_DISCOVERY_COLUMNS } from "./boardConstants";

export type EpicGroupKey = number | "none";

export interface EpicRow {
  key: EpicGroupKey;
  /** The epic, or null for the "No epic" row. */
  epic: Task | null;
  /** The unscheduled Stories of this row the Discovery board shows. */
  stories: Task[];
}

/**
 * The cards of the Factory Discovery board: unscheduled Stories in a status one
 * of its columns renders, never epics (FB-224). An unscheduled `done` Story (its
 * sprint was deleted) has no column, so it is no card and keeps no row.
 */
export function factoryDiscoveryStories(tasks: Task[]): Task[] {
  return tasks.filter(
    (t) =>
      isStoryLevel(t, "factory") &&
      t.sprint_id === null &&
      FACTORY_DISCOVERY_COLUMNS.some((c) => c.status === t.status)
  );
}

/**
 * Swimlanes of the Factory Discovery board grouped by epic (FB-224).
 *
 * One row per open (`todo`) epic, in creation order, even when it holds no card;
 * a `done` or `canceled` epic keeps its row only while it holds a Story the
 * board shows, so no card vanishes. Stories with no epic (or an epic that is not
 * a row) land in a last "No epic" row, omitted when empty. Every card of
 * `factoryDiscoveryStories` sits in exactly one row.
 */
export function buildEpicRows(tasks: Task[]): EpicRow[] {
  const stories = factoryDiscoveryStories(tasks);
  const epics = tasks.filter((t) => t.type === "epic").sort((a, b) => a.id - b.id);

  const rows: EpicRow[] = [];
  const rowIds = new Set<number>();
  for (const epic of epics) {
    const own = stories.filter((s) => s.epic_id === epic.id);
    if (epic.status !== "todo" && own.length === 0) continue;
    rows.push({ key: epic.id, epic, stories: own });
    rowIds.add(epic.id);
  }

  const loose = stories.filter((s) => s.epic_id === null || !rowIds.has(s.epic_id));
  if (loose.length > 0) rows.push({ key: "none", epic: null, stories: loose });
  return rows;
}
