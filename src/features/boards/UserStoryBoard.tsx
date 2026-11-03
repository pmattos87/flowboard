import { selectLabelFilter, useUiStore } from "@/stores/uiStore";
import { useTasks } from "@/hooks/useTasks";
import { usePeople } from "@/hooks/usePeople";
import { useProject } from "@/hooks/useProjects";
import { useSprints } from "@/hooks/useSprints";
import { RefreshButton } from "@/components/RefreshButton";
import { KanbanBoard } from "./shared/KanbanBoard";
import { invisibleStories, isStoryBoardRow, storyBoardColumns } from "./shared/invisibleStories";
import { InvisibleStoriesStrip } from "./shared/InvisibleStoriesStrip";
import { EpicSwimlaneBoard } from "./shared/EpicSwimlaneBoard";
import { GroupingToggle } from "./shared/GroupingToggle";
import { buildEpicRows } from "./shared/epicGrouping";
import { FACTORY_STORY_COLUMNS } from "./shared/boardConstants";
import { useStoryCardDecor } from "@/features/story/useStoryCardDecor";
import { SprintFilterSelect } from "./shared/SprintFilterSelect";
import { LabelFilterSelect } from "./shared/LabelFilterSelect";
import { matchesLabelFilter } from "@/lib/labels";
import { matchesSprintFilter, sprintFilterLabel } from "./shared/sprintFilter";

export function UserStoryBoard() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const boardSprintFilter = useUiStore((s) => s.boardSprintFilter);
  const grouping = useUiStore((s) => s.storyBoardGrouping);
  const setGrouping = useUiStore((s) => s.setStoryBoardGrouping);
  const labelFilter = useUiStore(selectLabelFilter(activeProjectId));
  const { data: allTasks } = useTasks(activeProjectId != null ? { project_id: activeProjectId } : undefined);
  const { data: people = [] } = usePeople();
  const { data: project } = useProject(activeProjectId);
  const { data: sprints } = useSprints(activeProjectId ?? undefined);
  const decorate = useStoryCardDecor(project, allTasks);

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
    .filter((t) => isStoryBoardRow(t, project?.ladder))
    .filter((t) => matchesSprintFilter(t, boardSprintFilter))
    .filter((t) => matchesLabelFilter(t, labelFilter));
  const isFactory = project?.ladder === "factory";
  const grouped = isFactory && grouping === "epic";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-white">User Story Board</h1>
          <RefreshButton />
        </div>
        <div className="ml-auto flex items-center gap-3">
          {isFactory && <GroupingToggle value={grouping} onChange={setGrouping} />}
          <SprintFilterSelect projectId={activeProjectId} includeBacklog={false} />
          <LabelFilterSelect projectId={activeProjectId} />
        </div>
      </div>
      {project && (
        <InvisibleStoriesStrip stories={invisibleStories(allTasks ?? [], project.ladder)} projectKey={project.key} />
      )}
      {tasks.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
          No stories in {sprintFilterLabel(boardSprintFilter, sprints)}
          {labelFilter !== null && ` with the label "${labelFilter}"`}.
        </div>
      ) : grouped && project ? (
        <EpicSwimlaneBoard
          rows={buildEpicRows(tasks, allTasks ?? [], { keepEmptyOpenEpics: false })}
          tasks={allTasks ?? []}
          columns={FACTORY_STORY_COLUMNS}
          emptyMessage={`No stories in ${sprintFilterLabel(boardSprintFilter, sprints)}.`}
          people={people}
          project={project}
          decorate={decorate}
        />
      ) : (
        <KanbanBoard
          tasks={tasks}
          people={people}
          projectKey={project?.key ?? "FB"}
          columns={storyBoardColumns(project?.ladder)}
          decorate={decorate}
        />
      )}
    </div>
  );
}
