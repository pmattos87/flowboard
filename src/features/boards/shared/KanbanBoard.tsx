import { useState } from "react";
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
import { COLUMNS } from "./boardConstants";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";

interface KanbanBoardProps {
  tasks: Task[];
  people: Person[];
  projectKey: string;
  onStatusChange: (taskId: number, newStatus: TaskStatus) => void;
}

export function KanbanBoard({ tasks, people, projectKey, onStatusChange }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveTask((event.active.data.current as { task: Task }).task);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over) {
      const newStatus = over.id as TaskStatus;
      const task = (active.data.current as { task: Task }).task;
      if (task.status !== newStatus) {
        onStatusChange(task.id, newStatus);
      }
    }
    setActiveTask(null);
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
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            status={col.status}
            label={col.label}
            dotClass={col.dotClass}
            tasks={tasks.filter((t) => t.status === col.status)}
            people={people}
            projectKey={projectKey}
            activeTaskId={activeTask?.id ?? null}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            people={people}
            projectKey={projectKey}
            isDragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
