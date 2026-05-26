import { useUiStore } from "@/stores/uiStore";
import { useTasks, useUpdateTask } from "@/hooks/useTasks";
import { usePeople } from "@/hooks/usePeople";
import { useProject } from "@/hooks/useProjects";
import type { TaskStatus } from "@/types";
import { KanbanBoard } from "./shared/KanbanBoard";

export function TaskBoard() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const { data: allTasks } = useTasks(activeProjectId != null ? { project_id: activeProjectId } : undefined);
  const { data: people = [] } = usePeople();
  const { data: project } = useProject(activeProjectId);
  const updateTask = useUpdateTask();

  if (activeProjectId == null) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Select a project from the sidebar to view the board.
      </div>
    );
  }

  function handleStatusChange(taskId: number, newStatus: TaskStatus) {
    updateTask.mutate({ id: taskId, payload: { status: newStatus } });
  }

  return (
    <div className="flex flex-col h-full">
      <h1 className="text-lg font-semibold text-white mb-6">Task Board</h1>
      <KanbanBoard
        tasks={allTasks ?? []}
        people={people}
        projectKey={project?.key ?? "FB"}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
