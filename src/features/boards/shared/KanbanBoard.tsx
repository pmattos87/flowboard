import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Person, Task, TaskStatus } from "@/types";
import { useUpdateTask } from "@/hooks/useTasks";
import { COLUMNS, sortByPriority, type BoardColumn } from "./boardConstants";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";

interface KanbanBoardProps {
  tasks: Task[];
  people: Person[];
  projectKey: string;
  /** Column set to render. Defaults to the shared 5-status workflow columns. */
  columns?: BoardColumn[];
}

export function KanbanBoard({ tasks, people, projectKey, columns = COLUMNS }: KanbanBoardProps) {
  const updateTask = useUpdateTask();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  // Local status overrides: applied immediately on drop, cleared when server data confirms.
  const [statusOverrides, setStatusOverrides] = useState<Record<number, TaskStatus>>({});

  const effectiveTasks = tasks.map((t) =>
    statusOverrides[t.id] !== undefined ? { ...t, status: statusOverrides[t.id] } : t
  );

  // Clear an override once the server data reflects the change (or the task is gone).
  useEffect(() => {
    setStatusOverrides((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const idStr of Object.keys(prev)) {
        const id = Number(idStr);
        const serverTask = tasks.find((t) => t.id === id);
        if (!serverTask || serverTask.status === prev[id]) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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

    const newStatus = over.id as TaskStatus;
    if (task.status === newStatus) return;

    setStatusOverrides((prev) => ({ ...prev, [task.id]: newStatus }));

    updateTask.mutate(
      { id: task.id, payload: { status: newStatus } },
      {
        onError: () => {
          setStatusOverrides((prev) => {
            const next = { ...prev };
            delete next[task.id];
            return next;
          });
        },
      }
    );
  }

  function handleDragCancel() {
    setActiveTask(null);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-row gap-4 overflow-x-auto pb-4 h-full">
        {columns.map((col) => {
          const colTasks = sortByPriority(
            effectiveTasks.filter((t) => t.status === col.status)
          );
          return (
            <KanbanColumn
              key={col.status}
              status={col.status}
              label={col.label}
              dotClass={col.dotClass}
              Icon={col.Icon}
              tasks={colTasks}
              people={people}
              projectKey={projectKey}
            />
          );
        })}
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
