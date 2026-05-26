import { useDroppable } from "@dnd-kit/core";
import type { Person, Task, TaskStatus } from "@/types";
import { TaskCard } from "./TaskCard";

interface KanbanColumnProps {
  status: TaskStatus;
  label: string;
  dotClass: string;
  tasks: Task[];
  people: Person[];
  projectKey: string;
}

export function KanbanColumn({
  status,
  label,
  dotClass,
  tasks,
  people,
  projectKey,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex flex-col flex-1 min-w-[240px]">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
          {label}
        </span>
        <span className="ml-auto text-xs text-gray-600 bg-gray-800 rounded px-1.5 py-0.5">
          {tasks.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 flex-1 rounded-lg p-2 min-h-[120px] transition-colors ${
          isOver ? "bg-gray-800/40" : "bg-gray-900/50"
        }`}
      >
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            people={people}
            projectKey={projectKey}
          />
        ))}
      </div>
    </div>
  );
}
