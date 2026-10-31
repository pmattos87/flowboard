import type { Project, Task } from "@/types";
import { isStoryLevel } from "@/lib/storyLevel";
import {
  COLUMNS,
  DISCOVERY_COLUMNS,
  FACTORY_DISCOVERY_COLUMNS,
  FACTORY_STORY_COLUMNS,
  type BoardColumn,
} from "./boardConstants";

type Ladder = Project["ladder"] | undefined;

/** The Discovery board's columns for a project's ladder. */
export function discoveryColumns(ladder: Ladder): BoardColumn[] {
  return ladder === "factory" ? FACTORY_DISCOVERY_COLUMNS : DISCOVERY_COLUMNS;
}

/** The User Story Board's columns for a project's ladder. */
export function storyBoardColumns(ladder: Ladder): BoardColumn[] {
  return ladder === "factory" ? FACTORY_STORY_COLUMNS : COLUMNS;
}

/**
 * A row the Discovery board takes: unscheduled Stories, plus unscheduled epics on
 * a legacy project (on a Factory project epics are never cards, FB-224).
 */
export function isDiscoveryRow(task: Task, ladder: Ladder): boolean {
  if (task.sprint_id !== null) return false;
  return isStoryLevel(task, ladder) || (ladder !== "factory" && task.type === "epic");
}

/** A row the User Story Board takes, before its sprint filter: scheduled Stories. */
export function isStoryBoardRow(task: Task, ladder: Ladder): boolean {
  return task.sprint_id !== null && isStoryLevel(task, ladder);
}

const inColumns = (columns: BoardColumn[], task: Task) => columns.some((c) => c.status === task.status);

/**
 * The Stories and epics of a project that render on neither the Discovery board
 * nor the User Story Board (FB-93): `KanbanBoard` drops a row whose status
 * matches no column. Ignores the User Story Board's sprint filter, since a row it
 * hides still renders under another filter.
 *
 * Legacy: unscheduled stories and epics outside the Discovery columns, scheduled
 * stories outside the story-board columns, and every scheduled epic (no board
 * shows those). Factory: Story-level rows (`isStoryLevel`) only. Subtasks, and
 * bugs on legacy, are never returned.
 */
export function invisibleStories(tasks: Task[], ladder: Ladder): Task[] {
  return tasks.filter((t) => {
    if (isDiscoveryRow(t, ladder)) return !inColumns(discoveryColumns(ladder), t);
    if (isStoryBoardRow(t, ladder)) return !inColumns(storyBoardColumns(ladder), t);
    return ladder !== "factory" && t.type === "epic" && t.sprint_id !== null;
  });
}
