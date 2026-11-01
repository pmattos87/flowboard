import { useNavigate } from "react-router-dom";
import type { CardDecor } from "@/features/boards/shared/TaskCard";
import type { Project, Task } from "@/types";
import { StoryFlags } from "./StoryFlags";
import { BlockedBy } from "./BlockedBy";
import { isStoryLevel } from "@/lib/storyLevel";
import { useBlockedBy } from "@/hooks/useStory";

// On a Factory project a Story opens its own page instead of the slide-over,
// and its board card carries the Run flags (SF-61). Legacy projects are left
// as they were.

/** The Story page path of a task, or null when it opens in the slide-over. */
export function storyPagePath(project: Project | undefined, task: Task): string | null {
  if (project?.ladder !== "factory" || !isStoryLevel(task, project.ladder)) return null;
  return `/story/${project.key}-${task.task_number}`;
}

/** The epic page path of a Factory epic (FB-224), or null when it opens in the slide-over. */
export function epicPagePath(project: Project | undefined, task: Task): string | null {
  if (project?.ladder !== "factory" || task.type !== "epic") return null;
  return `/epic/${project.key}-${task.task_number}`;
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
  const { data: blockedBy } = useBlockedBy(project);
  if (project?.ladder !== "factory") return undefined;
  return (task) => {
    const path = storyPagePath(project, task) ?? epicPagePath(project, task);
    if (!path) return {};
    const bugs = openBugCount(task, allTasks ?? []);
    const flagged = task.run_stopped || bugs > 0;
    const blockers = blockedBy?.[`${project.key}-${task.task_number}`] ?? [];
    return {
      onOpen: () => navigate(path),
      // Only when flagged or blocked, so a plain card keeps its spacing.
      badges:
        flagged || blockers.length > 0 ? (
          <div className="flex flex-col gap-1">
            {flagged && <StoryFlags stopped={task.run_stopped} waitingOnBugs={bugs} />}
            <BlockedBy keys={blockers} />
          </div>
        ) : undefined,
    };
  };
}
