import { useEffect, useMemo, useRef, useState } from "react";
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
import { CalendarDays, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/uiStore";
import { useTasks, useUpdateTask } from "@/hooks/useTasks";
import { useDeleteSprint, useSprints } from "@/hooks/useSprints";
import { usePeople } from "@/hooks/usePeople";
import { useProject } from "@/hooks/useProjects";
import { SprintFormDialog } from "@/features/sprints/SprintFormDialog";
import { RefreshButton } from "@/components/RefreshButton";
import type { Sprint, SprintStatus, Task } from "@/types";
import { cn } from "@/lib/utils";
import { TaskCard } from "./shared/TaskCard";
import { SprintFilterSelect } from "./shared/SprintFilterSelect";
import {
  buildSprintBoardRows,
  computeSprintDropPayload,
  isSprintScheduleBlocked,
  parseSprintDroppableId,
  sprintDroppableId,
  SPRINT_GATE_TOAST,
  type SprintBoardRow,
  type SprintBoardRowKey,
} from "./shared/sprintBoardGrouping";

const STATUS_STYLES: Record<SprintStatus, string> = {
  backlog: "bg-gray-700 text-gray-300",
  active: "bg-blue-700/60 text-blue-200",
  completed: "bg-emerald-800/60 text-emerald-300",
};

const STATUS_LABELS: Record<SprintStatus, string> = {
  backlog: "Backlog",
  active: "Active",
  completed: "Completed",
};

function formatDate(d: string) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function SprintSection({
  row,
  collapsed,
  onToggle,
  onEdit,
  onDelete,
  people,
  projectKey,
}: {
  row: SprintBoardRow;
  collapsed: boolean;
  onToggle: () => void;
  onEdit: (sprint: Sprint) => void;
  onDelete: (sprint: Sprint) => void;
  people: ReturnType<typeof usePeople>["data"];
  projectKey: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: sprintDroppableId(row.key) });
  const sprint = row.sprint;
  const peopleList = people ?? [];

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 mb-3">
      {/* Section header */}
      <div className="bg-gray-900 rounded-t-lg border-b border-gray-800">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="text-gray-400 hover:text-white shrink-0"
          aria-label={collapsed ? "Expand section" : "Collapse section"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {/* FB-91: the unscheduled row is named for the gate that lets a story in
            (FB-90), not "Backlog" — that name now belongs to the Discovery
            board's first column. Unrelated to STATUS_LABELS.backlog above,
            which is the sprint's own status badge. */}
        <span className="text-sm font-semibold text-white">
          {sprint ? sprint.name : "Ready for Development"}
        </span>
        {sprint && (
          <span
            className={cn(
              "text-[11px] font-medium px-2 py-0.5 rounded-full",
              STATUS_STYLES[sprint.status as SprintStatus],
            )}
          >
            {STATUS_LABELS[sprint.status as SprintStatus]}
          </span>
        )}
        <span className="text-[10px] text-gray-600 bg-gray-800 rounded px-1.5 py-0.5">
          {row.tasks.length}
        </span>
        {sprint && (
          <span className="flex items-center gap-1 text-xs text-gray-500 ml-1">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {formatDate(sprint.start_date)} — {formatDate(sprint.end_date)}
          </span>
        )}
        {sprint && (
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onEdit(sprint)}
              aria-label={`Edit ${sprint.name}`}
              className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(sprint)}
              aria-label={`Delete ${sprint.name}`}
              className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
        {sprint && sprint.goal.trim() !== "" && (
          <p className="px-3 pb-2 text-xs text-gray-400 truncate" title={sprint.goal}>
            <span className="text-gray-500">Goal:</span> {sprint.goal}
          </p>
        )}
      </div>

      {/* Drop zone */}
      {!collapsed && (
        <div
          ref={setNodeRef}
          className={cn(
            "flex flex-col gap-2 p-3 min-h-[80px] rounded-b-lg transition-colors",
            isOver ? "bg-gray-800/40" : "bg-gray-900/50",
          )}
        >
          {row.tasks.length === 0 ? (
            <div className="text-[11px] text-gray-600 text-center py-4 select-none">
              Drop stories here
            </div>
          ) : (
            row.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                people={peopleList}
                projectKey={projectKey}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function SprintPlanningBoard() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const boardSprintFilter = useUiStore((s) => s.boardSprintFilter);

  const { data: allTasks } = useTasks(
    activeProjectId != null ? { project_id: activeProjectId } : undefined,
  );
  const { data: sprints } = useSprints(activeProjectId ?? undefined);
  const { data: people } = usePeople();
  const { data: project } = useProject(activeProjectId);
  const updateTask = useUpdateTask();
  const deleteSprint = useDeleteSprint();

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [overrides, setOverrides] = useState<Record<number, number | null>>({});
  // Sections are expanded by default; track the keys the user has collapsed.
  const [collapsed, setCollapsed] = useState<Set<SprintBoardRowKey>>(new Set());
  // Completed sprints start collapsed. Seed once when the sprints first load
  // (the data is async, so a lazy useState initializer would run too early),
  // then leave the user's manual toggles alone.
  const seededCollapse = useRef(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const tasks = allTasks ?? [];

  // Optimistic sprint_id overrides, cleared once the refetch agrees.
  const effectiveTasks = useMemo(
    () =>
      tasks.map((t) =>
        t.id in overrides ? { ...t, sprint_id: overrides[t.id] } : t,
      ),
    [tasks, overrides],
  );

  useEffect(() => {
    setOverrides((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const idStr of Object.keys(prev)) {
        const id = Number(idStr);
        const serverTask = tasks.find((t) => t.id === id);
        if (!serverTask || serverTask.sprint_id === prev[id]) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  useEffect(() => {
    if (seededCollapse.current || !sprints) return;
    seededCollapse.current = true;
    const completed = sprints.filter((s) => s.status === "completed").map((s) => s.id);
    if (completed.length > 0) setCollapsed(new Set<SprintBoardRowKey>(completed));
  }, [sprints]);

  const rows = useMemo(
    () => buildSprintBoardRows(effectiveTasks, sprints ?? [], boardSprintFilter),
    [effectiveTasks, sprints, boardSprintFilter],
  );

  const projectKey = project?.key ?? "FB";

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (sprint: Sprint) => {
    setEditing(sprint);
    setModalOpen(true);
  };

  const handleModalClose = (open: boolean) => {
    setModalOpen(open);
    if (!open) setEditing(null);
  };

  const handleDelete = async (sprint: Sprint) => {
    if (deletingId === sprint.id) {
      try {
        await deleteSprint.mutateAsync(sprint.id);
      } catch (_) {
        // toast surfaced by the mutation's onError
      }
      setDeletingId(null);
    } else {
      setDeletingId(sprint.id);
    }
  };

  function toggleSection(key: SprintBoardRowKey) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const dragged = (event.active.data.current as { task: Task } | undefined)?.task;
    if (dragged) setActiveTask(dragged);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const task = (active.data.current as { task: Task } | undefined)?.task;
    setActiveTask(null);
    if (!over || !task) return;

    const target = parseSprintDroppableId(String(over.id));
    if (target === null) return;

    // FB-85: a story can only be scheduled into a sprint once it reaches
    // "Ready for Development". Guards the backlog -> sprint move (moving between
    // sprints or back to the backlog stays unrestricted).
    if (isSprintScheduleBlocked(task, target)) {
      toast.warning(SPRINT_GATE_TOAST.title, { description: SPRINT_GATE_TOAST.description });
      return;
    }

    const decision = computeSprintDropPayload(task, target);
    if (!decision) return;

    setOverrides((prev) => ({ ...prev, [task.id]: decision.override.sprint_id }));
    updateTask.mutate(
      { id: task.id, payload: decision.payload },
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

  if (activeProjectId == null) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Select a project from the sidebar to view the board.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Board header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-white">Sprint Planning Board</h1>
          <RefreshButton />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <SprintFilterSelect projectId={activeProjectId} />
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 text-white">
            <Plus className="h-4 w-4" />
            Create sprint
          </Button>
        </div>
      </div>

      {/* Inline delete confirmation */}
      {deletingId != null && (
        <div className="mb-3 bg-gray-800 rounded-lg p-3 flex items-center justify-between">
          <p className="text-sm text-gray-300">
            Delete sprint{" "}
            <span className="text-white font-medium">
              {sprints?.find((s) => s.id === deletingId)?.name}
            </span>
            ? Its stories return to the backlog.
          </p>
          <div className="flex gap-2 ml-4 shrink-0">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                const s = sprints?.find((x) => x.id === deletingId);
                if (s) handleDelete(s);
              }}
              disabled={deleteSprint.isPending}
            >
              {deleteSprint.isPending ? "Deleting…" : "Delete"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDeletingId(null)}
              className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex-1 overflow-y-auto pb-4">
          {rows.map((row) => (
            <SprintSection
              key={row.key}
              row={row}
              collapsed={collapsed.has(row.key)}
              onToggle={() => toggleSection(row.key)}
              onEdit={openEdit}
              onDelete={(s) => setDeletingId(s.id)}
              people={people}
              projectKey={projectKey}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <TaskCard
              task={activeTask}
              people={people ?? []}
              projectKey={projectKey}
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <SprintFormDialog
        open={modalOpen}
        onOpenChange={handleModalClose}
        projectId={activeProjectId}
        editing={editing}
      />
    </div>
  );
}
