import { useNavigate } from "react-router-dom";
import type { CardDecor } from "@/features/boards/shared/TaskCard";
import type { Project, Task } from "@/types";
import { StoryFlags } from "./StoryFlags";
import { isStoryLevel } from "@/lib/storyLevel";

// On a Factory project a Story opens its own page instead of the slide-over,
// and its board card carries the Run flags (SF-61). Legacy projects are left
// as they were.

/** The Story page path of a task, or null when it opens in the slide-over. */
export function storyPagePath(project: Project | undefined, task: Task): string | null {
  if (project?.ladder !== "factory" || !isStoryLevel(task, project.ladder)) return null;
  return `/story/${project.key}-${task.task_number}`;
}

/** Open bug Subtasks of a Story: the "waiting on N bugs" flag. */
export function openBugCount(story: Task, allTasks: Task[]): number {
  return allTasks.filter(
    (t) => t.parent_id === story.id && t.type === "bug" && t.status !== "done" && t.status !== "canceled",
  ).length;
}

/** `decorate` for a Story board; undefined on legacy projects. */
export function useStoryCardDecor(
  project: Project | undefined,
  allTasks: Task[] | undefined,
): ((task: Task) => CardDecor) | undefined {
  const navigate = useNavigate();
  if (project?.ladder !== "factory") return undefined;
  return (task) => {
    const path = storyPagePath(project, task);
    if (!path) return {};
    const bugs = openBugCount(task, allTasks ?? []);
    return {
      onOpen: () => navigate(path),
      // Only when flagged, so an unflagged card keeps its spacing.
      badges: task.run_stopped || bugs > 0 ? <StoryFlags stopped={task.run_stopped} waitingOnBugs={bugs} /> : undefined,
    };
  };
}
