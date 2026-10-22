import { useState } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useTasks } from "@/hooks/useTasks";
import { usePeople } from "@/hooks/usePeople";
import { useProject } from "@/hooks/useProjects";
import { RefreshButton } from "@/components/RefreshButton";
import { KanbanBoard } from "./shared/KanbanBoard";
import { DISCOVERY_COLUMNS, FACTORY_DISCOVERY_COLUMNS, withoutCanceled } from "./shared/boardConstants";
import { useStoryCardDecor } from "@/features/story/useStoryCardDecor";

export function DiscoveryBoard() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const { data: allTasks } = useTasks(activeProjectId != null ? { project_id: activeProjectId } : undefined);
  const { data: people = [] } = usePeople();
  const { data: project } = useProject(activeProjectId);
  const decorate = useStoryCardDecor(project, allTasks);
  const [showCanceled, setShowCanceled] = useState(false);

  if (activeProjectId == null) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Select a project from the sidebar to view the board.
      </div>
    );
  }

  const tasks = (allTasks ?? []).filter(
    (t) => (t.type === "epic" || t.type === "story") && t.sprint_id === null
  );

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-white">Discovery Board</h1>
          <RefreshButton />
          {project?.ladder === "factory" && (
            <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showCanceled}
                onChange={(e) => setShowCanceled(e.target.checked)}
                className="accent-blue-500"
              />
              Show canceled
            </label>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Backlog — stories and epics not yet assigned to a sprint.
        </p>
      </div>
      <KanbanBoard
        tasks={tasks}
        people={people}
        projectKey={project?.key ?? "FB"}
        columns={project?.ladder === "factory" ? withoutCanceled(FACTORY_DISCOVERY_COLUMNS, showCanceled) : DISCOVERY_COLUMNS}
        decorate={decorate}
      />
    </div>
  );
}
