import { Navigate } from "react-router-dom";
import { selectLabelFilter, useUiStore } from "@/stores/uiStore";
import { useTasks } from "@/hooks/useTasks";
import { usePeople } from "@/hooks/usePeople";
import { useProject } from "@/hooks/useProjects";
import { RefreshButton } from "@/components/RefreshButton";
import { TaskBoardGroupedKanban } from "./shared/TaskBoardGroupedKanban";
import { COLUMNS } from "./shared/boardConstants";
import { SprintFilterSelect } from "./shared/SprintFilterSelect";
import { LabelFilterSelect } from "./shared/LabelFilterSelect";
import { matchesLabelFilter } from "@/lib/labels";

export function TaskBoard() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const labelFilter = useUiStore(selectLabelFilter(activeProjectId));
  const { data: allTasks } = useTasks(activeProjectId != null ? { project_id: activeProjectId } : undefined);
  const { data: people = [] } = usePeople();
  const { data: project } = useProject(activeProjectId);

  // On a Factory project the Task board lives on each Story page (SF-61).
  if (project?.ladder === "factory") return <Navigate to="/board/user-story" replace />;

  if (activeProjectId == null) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Select a project from the sidebar to view the board.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-white">Task Board</h1>
          <RefreshButton />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <SprintFilterSelect projectId={activeProjectId} />
          <LabelFilterSelect projectId={activeProjectId} />
        </div>
      </div>
      <TaskBoardGroupedKanban
        // Stories are the row headers here; the label filter applies to the cards.
        tasks={(allTasks ?? []).filter((t) => t.type === "story" || matchesLabelFilter(t, labelFilter))}
        people={people}
        projectKey={project?.key ?? "FB"}
        columns={COLUMNS}
      />
    </div>
  );
}
