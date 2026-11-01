import type { Task } from "@/types";
import { isStoryLevel } from "@/lib/storyLevel";
import { FACTORY_DISCOVERY_COLUMNS } from "./boardConstants";

export type EpicGroupKey = number | "none";

export interface EpicRow {
  key: EpicGroupKey;
  /** The epic, or null for the "No epic" row. */
  epic: Task | null;
  /** The board's cards that sit in this row. */
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

export interface EpicRowOptions {
  /**
   * Whether an open (`todo`) epic keeps its row while it holds no card. The
   * Discovery board keeps one for every open epic; the Story board does not.
   */
  keepEmptyOpenEpics: boolean;
}

/**
 * Swimlanes of a board grouped by epic (FB-224, FB-291).
 *
 * `cards` are the board's cards; `tasks` are the project's tasks, where the
 * epics come from. One row per epic holding a card, in creation order; with
 * `keepEmptyOpenEpics`, every open (`todo`) epic also gets a row when it holds
 * none. Cards with no epic (or an epic that is not a row) land in a last
 * "No epic" row, omitted when empty. Every card sits in exactly one row.
 */
export function buildEpicRows(cards: Task[], tasks: Task[], { keepEmptyOpenEpics }: EpicRowOptions): EpicRow[] {
  const epics = tasks.filter((t) => t.type === "epic").sort((a, b) => a.id - b.id);

  const rows: EpicRow[] = [];
  const rowIds = new Set<number>();
  for (const epic of epics) {
    const own = cards.filter((s) => s.epic_id === epic.id);
    if (own.length === 0 && !(keepEmptyOpenEpics && epic.status === "todo")) continue;
    rows.push({ key: epic.id, epic, stories: own });
    rowIds.add(epic.id);
  }

  const loose = cards.filter((s) => s.epic_id === null || !rowIds.has(s.epic_id));
  if (loose.length > 0) rows.push({ key: "none", epic: null, stories: loose });
  return rows;
}
