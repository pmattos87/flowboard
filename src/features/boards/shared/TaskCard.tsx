import { useRef, type ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { User } from "lucide-react";
import type { Person, Task } from "@/types";
import { useUiStore } from "@/stores/uiStore";
import { Avatar } from "@/components/Avatar";
import { PRIORITY_META, TYPE_META } from "./boardConstants";

/** Per-card additions a board can make (SF-61): Run flags, a meta line, drag and click. */
export interface CardDecor {
  /** Shown under the title, e.g. the Run flags. */
  badges?: ReactNode;
  /** Shown above the footer, e.g. a Subtask's agent and Verify rounds. */
  meta?: ReactNode;
  dragDisabled?: boolean;
  /** Replaces opening the detail panel on click. */
  onOpen?: () => void;
}

interface TaskCardProps {
  task: Task;
  people: Person[];
  projectKey: string;
  isOverlay?: boolean;
  decor?: CardDecor;
}

export function TaskCard({ task, people, projectKey, isOverlay = false, decor }: TaskCardProps) {
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId);
  const accMove = useRef(0);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: isOverlay || decor?.dragDisabled === true,
  });

  // While being dragged, render a placeholder *inside* the same setNodeRef element so
  // useDraggable stays mounted and its data.current registration survives until drop.
  if (isDragging && !isOverlay) {
    return (
      <div
        ref={setNodeRef}
        className="rounded-lg border border-dashed border-gray-600 bg-gray-700/30 h-[80px]"
      />
    );
  }

  const style =
    transform
      ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
      : undefined;

  const assignee = people.find((p) => p.id === task.assignee_id);
  const labels = task.labels ? task.labels.split(",").filter(Boolean) : [];
  const typeMeta = TYPE_META[task.type];
  const priorityMeta = PRIORITY_META[task.priority];
  const { Icon: TypeIcon, colorClass: typeColor } = typeMeta ?? TYPE_META.subtask;
  const { Icon: PriorityIcon, colorClass: priorityColor } = priorityMeta ?? PRIORITY_META.medium;
  const ticketId = `${projectKey}-${task.task_number}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-gray-800 rounded-lg p-3 border border-gray-700/50 hover:border-gray-600 transition-colors select-none ${isOverlay ? "shadow-2xl ring-1 ring-blue-500/40" : decor?.dragDisabled ? "cursor-pointer" : "cursor-grab"}`}
      onMouseDown={() => { accMove.current = 0; }}
      onMouseMove={(e) => { accMove.current += Math.abs(e.movementX) + Math.abs(e.movementY); }}
      onClick={() => {
        if (accMove.current >= 5) return;
        if (decor?.onOpen) decor.onOpen();
        else setSelectedTaskId(task.id);
      }}
    >
      {/* Title row */}
      <div className="flex items-start gap-1.5 mb-2">
        <TypeIcon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${typeColor}`} />
        <span className="text-sm text-white font-medium leading-tight line-clamp-2">
          {task.title}
        </span>
      </div>

      {decor?.badges && <div className="mb-2">{decor.badges}</div>}

      {/* Label badges */}
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {labels.map((label) => (
            <span
              key={label}
              className="bg-gray-700 text-gray-300 rounded px-1.5 py-0.5 text-[10px]"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {decor?.meta && <div className="mb-1.5">{decor.meta}</div>}

      {/* Footer: priority icon + points + ticket ID + assignee */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-2">
          <PriorityIcon className={`h-3 w-3 ${priorityColor}`} />
          <span className="text-xs text-gray-500">{task.story_points}pts</span>
          <span className="text-[11px] font-mono text-gray-500">{ticketId}</span>
        </div>
        {assignee ? (
          <Avatar person={assignee} className="h-5 w-5 text-[10px]" />
        ) : (
          <div className="h-5 w-5 rounded-full bg-gray-600 flex items-center justify-center shrink-0">
            <User className="h-3 w-3 text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
}
