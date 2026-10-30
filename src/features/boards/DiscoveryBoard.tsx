import { Columns3, Layers } from "lucide-react";
import { useUiStore, type DiscoveryGrouping } from "@/stores/uiStore";
import { useTasks } from "@/hooks/useTasks";
import { usePeople } from "@/hooks/usePeople";
import { useProject } from "@/hooks/useProjects";
import { RefreshButton } from "@/components/RefreshButton";
import { KanbanBoard } from "./shared/KanbanBoard";
import { DiscoveryEpicBoard } from "./shared/DiscoveryEpicBoard";
import { DISCOVERY_COLUMNS, FACTORY_DISCOVERY_COLUMNS } from "./shared/boardConstants";
import { factoryDiscoveryStories } from "./shared/epicGrouping";
import { useStoryCardDecor } from "@/features/story/useStoryCardDecor";
import { isStoryLevel } from "@/lib/storyLevel";

const GROUPING_OPTIONS: { value: DiscoveryGrouping; label: string; Icon: typeof Layers }[] = [
  { value: "none", label: "No grouping", Icon: Columns3 },
  { value: "epic", label: "Group by epic", Icon: Layers },
];

export function DiscoveryBoard() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const grouping = useUiStore((s) => s.discoveryGrouping);
  const setGrouping = useUiStore((s) => s.setDiscoveryGrouping);
  const { data: allTasks } = useTasks(activeProjectId != null ? { project_id: activeProjectId } : undefined);
  const { data: people = [] } = usePeople();
  const { data: project } = useProject(activeProjectId);
  const decorate = useStoryCardDecor(project, allTasks);

  if (activeProjectId == null) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Select a project from the sidebar to view the board.
      </div>
    );
  }

  const isFactory = project?.ladder === "factory";
  // On a Factory project epics are never cards (FB-224); legacy keeps them.
  const tasks = isFactory
    ? factoryDiscoveryStories(allTasks ?? [])
    : (allTasks ?? []).filter(
        (t) => (t.type === "epic" || isStoryLevel(t, project?.ladder)) && t.sprint_id === null
      );
  const grouped = isFactory && grouping === "epic";

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6 flex items-start gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-white">Discovery Board</h1>
            <RefreshButton />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {isFactory
              ? "Backlog — Stories not yet assigned to a sprint."
              : "Backlog — stories and epics not yet assigned to a sprint."}
          </p>
        </div>
        {isFactory && (
          <div role="group" aria-label="Grouping" className="ml-auto flex items-center rounded border border-gray-700 p-0.5">
            {GROUPING_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setGrouping(value)}
                aria-pressed={grouping === value}
                className={`flex items-center gap-1.5 text-xs rounded px-2.5 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  grouping === value ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {grouped && project ? (
        <DiscoveryEpicBoard tasks={allTasks ?? []} people={people} project={project} decorate={decorate} />
      ) : (
        <KanbanBoard
          tasks={tasks}
          people={people}
          projectKey={project?.key ?? "FB"}
          columns={isFactory ? FACTORY_DISCOVERY_COLUMNS : DISCOVERY_COLUMNS}
          decorate={decorate}
        />
      )}
    </div>
  );
}
