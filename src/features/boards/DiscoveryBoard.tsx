import { selectLabelFilter, useUiStore } from "@/stores/uiStore";
import { useTasks } from "@/hooks/useTasks";
import { usePeople } from "@/hooks/usePeople";
import { useProject } from "@/hooks/useProjects";
import { RefreshButton } from "@/components/RefreshButton";
import { KanbanBoard } from "./shared/KanbanBoard";
import { EpicSwimlaneBoard } from "./shared/EpicSwimlaneBoard";
import { GroupingToggle } from "./shared/GroupingToggle";
import { discoveryColumns, invisibleStories, isDiscoveryRow } from "./shared/invisibleStories";
import { InvisibleStoriesStrip } from "./shared/InvisibleStoriesStrip";
import { FACTORY_DISCOVERY_COLUMNS } from "./shared/boardConstants";
import { buildEpicRows, factoryDiscoveryStories } from "./shared/epicGrouping";
import { useStoryCardDecor } from "@/features/story/useStoryCardDecor";
import { matchesLabelFilter } from "@/lib/labels";
import { LabelFilterSelect } from "./shared/LabelFilterSelect";

export function DiscoveryBoard() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const grouping = useUiStore((s) => s.discoveryGrouping);
  const setGrouping = useUiStore((s) => s.setDiscoveryGrouping);
  const labelFilter = useUiStore(selectLabelFilter(activeProjectId));
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
  const cards = isFactory
    ? factoryDiscoveryStories(allTasks ?? [])
    : (allTasks ?? []).filter((t) => isDiscoveryRow(t, project?.ladder));
  const tasks = cards.filter((t) => matchesLabelFilter(t, labelFilter));
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
        <div className="ml-auto flex items-center gap-3">
          {isFactory && <GroupingToggle value={grouping} onChange={setGrouping} />}
          <LabelFilterSelect projectId={activeProjectId} />
        </div>
      </div>
      {project && (
        <InvisibleStoriesStrip stories={invisibleStories(allTasks ?? [], project.ladder)} projectKey={project.key} />
      )}
      {grouped && project ? (
        <EpicSwimlaneBoard
          rows={buildEpicRows(cards, allTasks ?? [], { keepEmptyOpenEpics: true }).map((row) => ({
            ...row,
            stories: row.stories.filter((s) => matchesLabelFilter(s, labelFilter)),
          }))}
          tasks={allTasks ?? []}
          columns={FACTORY_DISCOVERY_COLUMNS}
          emptyMessage="No epics or Stories in the backlog yet."
          people={people}
          project={project}
          decorate={decorate}
        />
      ) : (
        <KanbanBoard
          tasks={tasks}
          people={people}
          projectKey={project?.key ?? "FB"}
          columns={discoveryColumns(project?.ladder)}
          decorate={decorate}
        />
      )}
    </div>
  );
}
