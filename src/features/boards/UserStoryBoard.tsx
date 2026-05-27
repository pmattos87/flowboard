import { useUiStore } from "@/stores/uiStore";
import { useTasks } from "@/hooks/useTasks";
import { usePeople } from "@/hooks/usePeople";
import { useProject } from "@/hooks/useProjects";
import { useSprints } from "@/hooks/useSprints";
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

  const tasks = (allTasks ?? [])
    .filter((t) => t.type === "story")
    .filter((t) => matchesSprintFilter(t, boardSprintFilter));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-lg font-semibold text-white">User Story Board</h1>
        <div className="ml-auto">
          <SprintFilterSelect projectId={activeProjectId} />
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
