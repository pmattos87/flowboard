import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Person, Project, Task } from "@/types";
import { epicProgress } from "@/lib/epicProgress";
import { epicPagePath } from "@/features/story/useStoryCardDecor";
import { KanbanBoard } from "./KanbanBoard";
import { ProgressBar } from "./TaskBoardGroupedKanban";
import { FACTORY_DISCOVERY_COLUMNS } from "./boardConstants";
import type { CardDecor } from "./TaskCard";
import { buildEpicRows, type EpicGroupKey, type EpicRow } from "./epicGrouping";

interface DiscoveryEpicBoardProps {
  /** Every task of the project: rows show the unscheduled Stories, progress counts them all. */
  tasks: Task[];
  people: Person[];
  project: Project;
  decorate?: (task: Task) => CardDecor;
}

function RowHeader({
  row,
  project,
  tasks,
  collapsed,
  onToggle,
}: {
  row: EpicRow;
  project: Project;
  tasks: Task[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const name = row.epic ? `${project.key}-${row.epic.task_number}` : "No epic";
  const path = row.epic ? epicPagePath(project, row.epic) : null;
  const progress = row.epic ? epicProgress(row.epic.id, tasks) : null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-t-lg border-b border-gray-800">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Collapse"} ${name}`}
        className="text-gray-400 hover:text-white shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {row.epic && path ? (
        <Link
          to={path}
          className="flex items-center gap-2 min-w-0 rounded hover:text-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span className="text-[11px] font-mono text-gray-500 shrink-0">{name}</span>
          <span className="text-sm text-white font-medium truncate">{row.epic.title}</span>
        </Link>
      ) : (
        <span className="text-sm font-medium text-gray-300">No epic</span>
      )}
      {row.epic && row.epic.status !== "todo" && (
        <span className="text-[10px] uppercase tracking-wider text-gray-400 bg-gray-800 rounded px-1.5 py-0.5 shrink-0">
          {row.epic.status}
        </span>
      )}
      <span className="text-xs text-gray-500 shrink-0">
        {row.stories.length} card{row.stories.length === 1 ? "" : "s"}
      </span>
      {progress && (
        <div className="ml-auto flex items-center gap-3 shrink-0" data-testid="epic-progress">
          <ProgressBar done={progress.tested} total={progress.total} />
          <span className="text-xs text-gray-500">tested</span>
          <span className="text-xs text-gray-500 tabular-nums">{progress.pointsLeft} pts left</span>
        </div>
      )}
    </div>
  );
}

/** The Factory Discovery board grouped by epic (FB-224): one collapsible row per epic. */
export function DiscoveryEpicBoard({ tasks, people, project, decorate }: DiscoveryEpicBoardProps) {
  const [collapsed, setCollapsed] = useState<Set<EpicGroupKey>>(new Set());
  const rows = buildEpicRows(tasks);

  function toggle(key: EpicGroupKey) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        No epics or Stories in the backlog yet.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      {rows.map((row) => {
        const isCollapsed = collapsed.has(row.key);
        return (
          <section
            key={row.key}
            aria-label={row.epic ? row.epic.title : "No epic"}
            className="rounded-lg border border-gray-800 bg-gray-950 mb-3"
          >
            <RowHeader
              row={row}
              project={project}
              tasks={tasks}
              collapsed={isCollapsed}
              onToggle={() => toggle(row.key)}
            />
            {/* Each row is its own DndContext: a card moves between columns of its
                row only; dropping it in another row finds no drop zone. */}
            {!isCollapsed && (
              <div className="p-3">
                <KanbanBoard
                  tasks={row.stories}
                  people={people}
                  projectKey={project.key}
                  columns={FACTORY_DISCOVERY_COLUMNS}
                  decorate={decorate}
                />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
