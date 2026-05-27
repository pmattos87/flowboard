import { useEffect, useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { Person, Task, TaskStatus } from "@/types";
import { useUiStore } from "@/stores/uiStore";
import { useUpdateTask } from "@/hooks/useTasks";
import type { TaskUpdatePayload } from "@/lib/commands";
import { COLUMNS, PRIORITY_META, TYPE_META } from "./boardConstants";
import { TaskCard } from "./TaskCard";
import {
  buildTaskBoardRows,
  computeDropPayload,
  droppableId,
  parseDroppableId,
  progressOf,
  type StoryGroupKey,
  type TaskBoardRow,
} from "./taskBoardGrouping";

interface TaskBoardGroupedKanbanProps {
  tasks: Task[];
  people: Person[];
  projectKey: string;
}

// Tint the story type icon by the story's own status so it's visible at a glance
// without occupying header space.
const STORY_STATUS_COLOR: Record<TaskStatus, string> = {
  todo: "text-gray-400",
  in_progress: "text-blue-400",
  in_review: "text-yellow-400",
  done: "text-emerald-400",
};

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-gray-800 overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 font-mono tabular-nums">
        {done}/{total}
      </span>
    </div>
  );
}

function GroupedColumn({
  status,
  label,
  dotClass,
  groupKey,
  storyId,
  storySprintId,
  tasks,
  people,
  projectKey,
}: {
  status: TaskStatus;
  label: string;
  dotClass: string;
  groupKey: StoryGroupKey;
  storyId: number | null;
  storySprintId: number | null;
  tasks: Task[];
  people: Person[];
  projectKey: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId(status, groupKey) });
  const openCreateTaskModal = useUiStore((s) => s.openCreateTaskModal);

  return (
    <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
          {label}
        </span>
        <span className="text-[10px] text-gray-600 bg-gray-800 rounded px-1.5 py-0.5">
          {tasks.length}
        </span>
        <button
          type="button"
          onClick={() =>
            openCreateTaskModal({
              parent_id: storyId,
              sprint_id: storySprintId,
              status,
            })
          }
          className="ml-auto text-gray-500 hover:text-gray-200 rounded p-0.5 hover:bg-gray-800"
          aria-label={`Add task to ${label}`}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 rounded-lg p-2 min-h-[80px] transition-colors ${
          isOver ? "bg-gray-800/40" : "bg-gray-900/50"
        }`}
      >
        {tasks.length === 0 ? (
          <div className="text-[11px] text-gray-600 text-center py-4 select-none">
            Drop tasks here
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              people={people}
              projectKey={projectKey}
            />
          ))
        )}
      </div>
    </div>
  );
}

function StoryRowHeader({
  row,
  collapsed,
  onToggle,
  projectKey,
}: {
  row: TaskBoardRow;
  collapsed: boolean;
  onToggle: () => void;
  projectKey: string;
}) {
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId);
  const openCreateTaskModal = useUiStore((s) => s.openCreateTaskModal);
  const { done, total } = progressOf(row.children);

  if (row.story === null) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-t-lg border-b border-gray-800">
        <button
          type="button"
          onClick={onToggle}
          className="text-gray-400 hover:text-white"
          aria-label={collapsed ? "Expand group" : "Collapse group"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        <span className="text-sm font-medium text-gray-300">Unparented</span>
        <span className="text-xs text-gray-500 ml-2">
          {row.children.length} item{row.children.length === 1 ? "" : "s"}
        </span>
      </div>
    );
  }

  const story = row.story;
  const typeMeta = TYPE_META[story.type] ?? TYPE_META.story;
  const priorityMeta = PRIORITY_META[story.priority] ?? PRIORITY_META.medium;
  const TypeIcon = typeMeta.Icon;
  const PriorityIcon = priorityMeta.Icon;
  const ticketId = `${projectKey}-${story.id}`;
  const statusColor = STORY_STATUS_COLOR[story.status] ?? typeMeta.colorClass;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-t-lg border-b border-gray-800">
      <button
        type="button"
        onClick={onToggle}
        className="text-gray-400 hover:text-white shrink-0"
        aria-label={collapsed ? "Expand story" : "Collapse story"}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      <TypeIcon
        className={`h-4 w-4 shrink-0 ${statusColor}`}
        aria-label={`Story status: ${story.status.replace("_", " ")}`}
      />
      <button
        type="button"
        onClick={() => setSelectedTaskId(story.id)}
        className="text-[11px] font-mono text-gray-500 hover:text-blue-400 shrink-0"
      >
        {ticketId}
      </button>
      <button
        type="button"
        onClick={() => setSelectedTaskId(story.id)}
        className="text-sm text-white font-medium truncate hover:text-blue-400 text-left"
      >
        {story.title}
      </button>
      <PriorityIcon
        className={`h-3.5 w-3.5 shrink-0 ml-1 ${priorityMeta.colorClass}`}
      />
      <div className="ml-auto flex items-center gap-3 shrink-0">
        <ProgressBar done={done} total={total} />
        <button
          type="button"
          onClick={() =>
            openCreateTaskModal({
              parent_id: story.id,
              sprint_id: story.sprint_id,
            })
          }
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded px-2 py-1 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
    </div>
  );
}

function StoryRow({
  row,
  collapsed,
  onToggle,
  people,
  projectKey,
}: {
  row: TaskBoardRow;
  collapsed: boolean;
  onToggle: () => void;
  people: Person[];
  projectKey: string;
}) {
  const storyId = row.story?.id ?? null;
  const storySprintId = row.story?.sprint_id ?? null;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 mb-3">
      <StoryRowHeader
        row={row}
        collapsed={collapsed}
        onToggle={onToggle}
        projectKey={projectKey}
      />
      {!collapsed && (
        <div className="grid grid-cols-4 gap-3 p-3">
          {COLUMNS.map((col) => {
            const colTasks = row.children.filter((c) => c.status === col.status);
            return (
              <GroupedColumn
                key={col.status}
                status={col.status}
                label={col.label}
                dotClass={col.dotClass}
                groupKey={row.key}
                storyId={storyId}
                storySprintId={storySprintId}
                tasks={colTasks}
                people={people}
                projectKey={projectKey}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TaskBoardGroupedKanban({
  tasks,
  people,
  projectKey,
}: TaskBoardGroupedKanbanProps) {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const boardSprintFilter = useUiStore((s) => s.boardSprintFilter);
  const updateTask = useUpdateTask();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  // Optimistic post-drop overrides — kept until the React Query refetch agrees.
  // Tracks status, parent_id, and sprint_id together so reparenting + status
  // changes from a single drop both render immediately.
  type DragOverride = {
    status?: TaskStatus;
    parent_id?: number | null;
    sprint_id?: number | null;
  };
  const [overrides, setOverrides] = useState<Record<number, DragOverride>>({});
  // Collapse state keyed by activeProjectId — reset when switching projects.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<StoryGroupKey>>(
    new Set(),
  );
  const [collapseProjectKey, setCollapseProjectKey] = useState<number | null>(
    activeProjectId,
  );
  if (collapseProjectKey !== activeProjectId) {
    setCollapseProjectKey(activeProjectId);
    setCollapsedGroups(new Set());
  }

  const effectiveTasks = useMemo(
    () =>
      tasks.map((t) => {
        const o = overrides[t.id];
        return o ? { ...t, ...o } : t;
      }),
    [tasks, overrides],
  );

  // Clear an override once the server-side data reflects every overridden field.
  useEffect(() => {
    setOverrides((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const idStr of Object.keys(prev)) {
        const id = Number(idStr);
        const serverTask = tasks.find((t) => t.id === id);
        if (!serverTask) {
          delete next[id];
          changed = true;
          continue;
        }
        const o = prev[id];
        const statusOk = o.status === undefined || serverTask.status === o.status;
        const parentOk =
          o.parent_id === undefined || serverTask.parent_id === o.parent_id;
        const sprintOk =
          o.sprint_id === undefined || serverTask.sprint_id === o.sprint_id;
        if (statusOk && parentOk && sprintOk) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  const rows = useMemo(
    () => buildTaskBoardRows(effectiveTasks, boardSprintFilter),
    [effectiveTasks, boardSprintFilter],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function toggleGroup(key: StoryGroupKey) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const dragged = (event.active.data.current as { task: Task } | undefined)
      ?.task;
    if (!dragged) return;
    setActiveTask(dragged);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const task = (active.data.current as { task: Task } | undefined)?.task;
    setActiveTask(null);
    if (!over || !task) return;

    const parsed = parseDroppableId(String(over.id));
    if (!parsed) return;

    const decision = computeDropPayload(task, parsed, tasks);
    if (!decision) return;

    setOverrides((prev) => ({
      ...prev,
      [task.id]: { ...prev[task.id], ...decision.override },
    }));
    updateTask.mutate(
      { id: task.id, payload: decision.payload as TaskUpdatePayload },
      {
        onError: () => {
          setOverrides((prev) => {
            const next = { ...prev };
            delete next[task.id];
            return next;
          });
        },
      },
    );
  }

  function handleDragCancel() {
    setActiveTask(null);
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        No tasks match the current filter. Try a different sprint or create a story.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex-1 overflow-y-auto pb-4">
        {rows.map((row) => (
          <StoryRow
            key={row.key}
            row={row}
            collapsed={collapsedGroups.has(row.key)}
            onToggle={() => toggleGroup(row.key)}
            people={people}
            projectKey={projectKey}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            people={people}
            projectKey={projectKey}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
