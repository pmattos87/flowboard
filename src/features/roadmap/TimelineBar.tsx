import { useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { Sprint, SprintStatus } from "@/types";
import {
  PX_PER_DAY,
  dateToPx,
  daysBetween,
  snapPxToDay,
  type Scale,
} from "./utils/dateMath";

const BAR_STYLES: Record<SprintStatus, string> = {
  backlog: "bg-gray-700/80 border-gray-600",
  active: "bg-blue-700/80 border-blue-500",
  completed: "bg-emerald-800/70 border-emerald-600",
};

const STATUS_LABELS: Record<SprintStatus, string> = {
  backlog: "Backlog",
  active: "Active",
  completed: "Completed",
};

const CLICK_THRESHOLD_PX = 5;

interface Props {
  sprint: Sprint;
  origin: string;
  scale: Scale;
  onOpen: (sprint: Sprint) => void;
}

export function TimelineBar({ sprint, origin, scale, onOpen }: Props) {
  const move = useDraggable({ id: `move:${sprint.id}` });
  const left = useDraggable({ id: `left:${sprint.id}` });
  const right = useDraggable({ id: `right:${sprint.id}` });

  const downPos = useRef<{ x: number; y: number } | null>(null);

  const px = PX_PER_DAY[scale];
  const baseLeft = dateToPx(sprint.start_date, origin, scale);
  const baseWidth = Math.max(
    px,
    (daysBetween(sprint.start_date, sprint.end_date) + 1) * px,
  );

  const moveDx = snapPxToDay(move.transform?.x ?? 0, scale);
  const leftDx = snapPxToDay(left.transform?.x ?? 0, scale);
  const rightDx = snapPxToDay(right.transform?.x ?? 0, scale);

  const clampedLeftDx = Math.min(leftDx, baseWidth - px);
  const clampedRightDx = Math.max(rightDx, px - baseWidth);

  const effLeft = baseLeft + moveDx + clampedLeftDx;
  const effWidth = Math.max(px, baseWidth - clampedLeftDx + clampedRightDx);

  const status = sprint.status as SprintStatus;

  const handlePointerDown = (e: React.PointerEvent) => {
    downPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleClick = (e: React.MouseEvent) => {
    const start = downPos.current;
    downPos.current = null;
    if (start) {
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx >= CLICK_THRESHOLD_PX || dy >= CLICK_THRESHOLD_PX) return;
    }
    onOpen(sprint);
  };

  return (
    <div
      className={cn(
        "absolute top-1/2 -translate-y-1/2 h-8 rounded-md border text-white text-xs overflow-hidden",
        BAR_STYLES[status],
      )}
      style={{ left: effLeft, width: effWidth }}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      title={`${sprint.name} — ${STATUS_LABELS[status]}`}
    >
      <div
        ref={left.setNodeRef}
        {...left.listeners}
        {...left.attributes}
        aria-label={`Resize ${sprint.name} start date`}
        className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/15"
      />
      <div
        ref={move.setNodeRef}
        {...move.listeners}
        {...move.attributes}
        role="button"
        tabIndex={0}
        aria-label={`Move ${sprint.name}`}
        className="absolute inset-y-0 left-2 right-2 px-2 flex items-center truncate cursor-grab active:cursor-grabbing select-none"
      >
        <span className="font-medium truncate">{sprint.name}</span>
      </div>
      <div
        ref={right.setNodeRef}
        {...right.listeners}
        {...right.attributes}
        aria-label={`Resize ${sprint.name} end date`}
        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/15"
      />
    </div>
  );
}
