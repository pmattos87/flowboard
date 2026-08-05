import { useUiStore } from "@/stores/uiStore";
import { useTasks } from "@/hooks/useTasks";
import { usePeople } from "@/hooks/usePeople";
import { useProject } from "@/hooks/useProjects";
import { useSprints } from "@/hooks/useSprints";
import { RefreshButton } from "@/components/RefreshButton";
import { KanbanBoard } from "./shared/KanbanBoard";
import { SprintFilterSelect } from "./shared/SprintFilterSelect";
import { matchesSprintFilter, sprintFilterLabel } from "./shared/sprintFilter";

export function UserStoryBoard() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const boardSprintFilter = useUiStore((s) => s.boardSprintFilter);
  const { data: allTasks } = useTasks(activeProjectId != null ? { project_id: activeProjectId } : undefined);
  const { data: people = [] } = usePeople();
  const { data: project } = useProject(activeProjectId);
  const { data: sprints } = useSprints(activeProjectId ?? undefined);

  if (activeProjectId == null) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Select a project from the sidebar to view the board.
      </div>
    );
  }

  // This board renders the dev workflow, which a story only enters once it is
  // scheduled. Unscheduled stories belong to the Discovery board — showing them
  // here too listed the same story twice under two different column names
  // (Discovery BACKLOG vs. this board's TO DO).
  const tasks = (allTasks ?? [])
    .filter((t) => t.type === "story")
    .filter((t) => t.sprint_id !== null)
    .filter((t) => matchesSprintFilter(t, boardSprintFilter));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-white">User Story Board</h1>
          <RefreshButton />
        </div>
        <div className="ml-auto">
          <SprintFilterSelect projectId={activeProjectId} includeBacklog={false} />
        </div>
      </div>
      {tasks.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
          No stories in {sprintFilterLabel(boardSprintFilter, sprints)}.
        </div>
      ) : (
        <KanbanBoard
          tasks={tasks}
          people={people}
          projectKey={project?.key ?? "FB"}
        />
      )}
    </div>
  );
}
