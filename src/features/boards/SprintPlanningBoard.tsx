import { useEffect, useState } from "react";
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
import { useUiStore } from "@/stores/uiStore";
import { useTasks, useUpdateTask } from "@/hooks/useTasks";
import { useSprints } from "@/hooks/useSprints";
import { usePeople } from "@/hooks/usePeople";
import { useProject } from "@/hooks/useProjects";
import type { Task } from "@/types";
import { TaskCard } from "./shared/TaskCard";

function DroppablePanel({
  id,
  label,
  count,
  tasks,
  people,
  projectKey,
}: {
  id: string;
  label: string;
  count: number;
  tasks: Task[];
  people: ReturnType<typeof usePeople>["data"];
  projectKey: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const peopleList = people ?? [];

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* Panel header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
          {label}
        </span>
        <span className="ml-auto text-xs text-gray-600 bg-gray-800 rounded px-1.5 py-0.5">
          {count}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 flex-1 rounded-lg p-2 min-h-[200px] transition-colors ${
          isOver ? "bg-gray-800/40" : "bg-gray-900/50"
        }`}
      >
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            people={peopleList}
            projectKey={projectKey}
          />
        ))}
      </div>
    </div>
  );
}

export function SprintPlanningBoard() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const selectedSprintId = useUiStore((s) => s.selectedSprintId);
  const setSelectedSprintId = useUiStore((s) => s.setSelectedSprintId);

  const { data: allTasks } = useTasks(
    activeProjectId != null ? { project_id: activeProjectId } : undefined
  );
  const { data: sprints } = useSprints(activeProjectId ?? undefined);
  const { data: people } = usePeople();
  const { data: project } = useProject(activeProjectId);
  const updateTask = useUpdateTask();

  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Auto-select active sprint (or last sprint as fallback)
  useEffect(() => {
    if (!sprints?.length) return;
    if (selectedSprintId != null && sprints.some((s) => s.id === selectedSprintId)) return;
    const active = sprints.find((s) => s.status === "active") ?? sprints[sprints.length - 1];
    setSelectedSprintId(active.id);
  }, [sprints, selectedSprintId, setSelectedSprintId]);

  if (activeProjectId == null) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Select a project from the sidebar to view the board.
      </div>
    );
  }

  if (!sprints?.length) {
    return (
      <div className="flex flex-col h-full">
        <h1 className="text-lg font-semibold text-white mb-6">Sprint Planning Board</h1>
        <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
          No sprints for this project. Create one in the Sprints page.
        </div>
      </div>
    );
  }

  const activeSprint = sprints.find((s) => s.id === selectedSprintId) ?? null;
  const backlogTasks = (allTasks ?? []).filter(
    (t) => t.sprint_id === null && t.type === "story",
  );
  const sprintTasks = (allTasks ?? []).filter((t) => t.sprint_id === selectedSprintId);
  const projectKey = project?.key ?? "FB";

  function handleDragStart(event: DragStartEvent) {
    const dragged = (event.active.data.current as { task: Task } | undefined)?.task;
    if (!dragged) return;
    setActiveTask(dragged);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const task = (active.data.current as { task: Task } | undefined)?.task;
    setActiveTask(null);
    if (!over || !task) return;

    if (over.id === "backlog" && task.sprint_id !== null) {
      updateTask.mutate({ id: task.id, payload: { sprint_id: null } });
    } else if (over.id === "sprint" && activeSprint && task.sprint_id !== activeSprint.id) {
      updateTask.mutate({ id: task.id, payload: { sprint_id: activeSprint.id } });
    }
  }

  function handleDragCancel() {
    setActiveTask(null);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Board header */}
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-lg font-semibold text-white">Sprint Planning Board</h1>
        <select
          value={selectedSprintId ?? ""}
          onChange={(e) => setSelectedSprintId(Number(e.target.value))}
          className="ml-auto bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.status === "active" ? " (active)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Two-panel DnD board */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex flex-row gap-4 flex-1 overflow-hidden">
          <DroppablePanel
            id="backlog"
            label="Backlog"
            count={backlogTasks.length}
            tasks={backlogTasks}
            people={people}
            projectKey={projectKey}
          />
          <div className="w-px bg-gray-800 shrink-0" />
          <DroppablePanel
            id="sprint"
            label={activeSprint?.name ?? "Sprint"}
            count={sprintTasks.length}
            tasks={sprintTasks}
            people={people}
            projectKey={projectKey}
          />
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
    </div>
  );
}
