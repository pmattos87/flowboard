import type { Project, Task } from "@/types";

/**
 * Whether a row is a Story (FB-52). The TS copy of `is_story_level` in
 * `src-tauri/src/factory/ops.rs`.
 *
 * On a Factory project the parent decides: a top-level `story` (a feature) or a
 * top-level `bug` (a fix) is a Story; a `bug` with a parent is a bug Subtask.
 * On a legacy project a Story is still a `story` row, and a top-level bug stays a
 * plain bug.
 */
export function isStoryLevel(
  task: Pick<Task, "type" | "parent_id">,
  ladder: Project["ladder"] | undefined,
): boolean {
  if (ladder !== "factory") return task.type === "story";
  return task.parent_id === null && (task.type === "story" || task.type === "bug");
}
