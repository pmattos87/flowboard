import { cn } from "@/lib/utils";
import type { Sprint, SprintStatus } from "@/types";
import {
  PX_PER_DAY,
  dateToPx,
  daysBetween,
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

interface Props {
  sprint: Sprint;
  origin: string;
  scale: Scale;
  onOpen: (sprint: Sprint) => void;
}

export function TimelineBar({ sprint, origin, scale, onOpen }: Props) {
  const status = sprint.status as SprintStatus;
  const baseLeft = dateToPx(sprint.start_date, origin, scale);
  const baseWidth = Math.max(
    PX_PER_DAY[scale],
    (daysBetween(sprint.start_date, sprint.end_date) + 1) * PX_PER_DAY[scale],
  );

  return (
    <button
      type="button"
      onClick={() => onOpen(sprint)}
      aria-label={`Edit ${sprint.name}`}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 h-8 rounded-md border text-left text-xs text-white px-2 truncate hover:brightness-110 transition",
        BAR_STYLES[status],
      )}
      style={{ left: baseLeft, width: baseWidth }}
      title={`${sprint.name} — ${STATUS_LABELS[status]}`}
    >
      <span className="font-medium">{sprint.name}</span>
    </button>
  );
}
