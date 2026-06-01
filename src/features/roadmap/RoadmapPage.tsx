import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { SprintFormDialog } from "@/features/sprints/SprintFormDialog";
import { useSprints, useUpdateSprint } from "@/hooks/useSprints";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import type { Sprint, SprintStatus } from "@/types";
import { TimelineHeader } from "./TimelineHeader";
import { TimelineBar } from "./TimelineBar";
import { TodayIndicator } from "./TodayIndicator";
import {
  PX_PER_DAY,
  addDays,
  dateToPx,
  daysBetween,
  originForScale,
  pxToDays,
  todayIso,
  type Scale,
} from "./utils/dateMath";

const LABEL_WIDTH = 192;
const ROW_HEIGHT = 56;
const HEADER_HEIGHT = 48;

const STATUS_BADGE: Record<SprintStatus, string> = {
  backlog: "bg-gray-700 text-gray-300",
  active: "bg-blue-700/60 text-blue-200",
  completed: "bg-emerald-800/60 text-emerald-300",
};

const STATUS_LABELS: Record<SprintStatus, string> = {
  backlog: "Backlog",
  active: "Active",
  completed: "Completed",
};

const SCALES: { value: Scale; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

export default function RoadmapPage() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const { data: sprints, isLoading } = useSprints(activeProjectId ?? undefined);
  const updateSprint = useUpdateSprint();
  const [scale, setScale] = useState<Scale>("week");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Sprint | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  // The roadmap's long axis is horizontal, so redirect vertical wheel input to
  // horizontal scroll. Leave it alone when there are enough rows to actually
  // need vertical scrolling.
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || e.deltaY === 0) return;
    if (el.scrollHeight <= el.clientHeight) {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };

  const today = todayIso();

  const { origin, end, totalPx } = useMemo(() => {
    const list = sprints ?? [];
    let earliest = today;
    let latest = addDays(today, 60);
    if (list.length > 0) {
      const starts = list.map((s) => s.start_date).filter(Boolean);
      const ends = list.map((s) => s.end_date).filter(Boolean);
      earliest = starts.reduce((a, b) => (a < b ? a : b), starts[0]);
      latest = ends.reduce((a, b) => (a > b ? a : b), ends[0]);
      earliest = addDays(earliest, -14);
      latest = addDays(latest, 14);
    }
    // Also include today in range
    if (today < earliest) earliest = addDays(today, -14);
    if (today > latest) latest = addDays(today, 14);
    const o = originForScale(earliest, scale);
    const totalDays = Math.max(daysBetween(o, latest), 14);
    return { origin: o, end: latest, totalPx: totalDays * PX_PER_DAY[scale] };
  }, [sprints, scale, today]);

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

  const handleDragEnd = (event: DragEndEvent) => {
    const id = String(event.active.id);
    const colonAt = id.indexOf(":");
    if (colonAt < 0) return;
    const type = id.slice(0, colonAt);
    const sprintId = Number(id.slice(colonAt + 1));
    const sprint = (sprints ?? []).find((s) => s.id === sprintId);
    if (!sprint) return;
    const days = pxToDays(event.delta.x, scale);
    if (days === 0) return;

    if (type === "move") {
      updateSprint.mutate({
        id: sprint.id,
        payload: {
          start_date: addDays(sprint.start_date, days),
          end_date: addDays(sprint.end_date, days),
        },
      });
    } else if (type === "left") {
      const newStart = addDays(sprint.start_date, days);
      if (newStart > sprint.end_date) return;
      updateSprint.mutate({
        id: sprint.id,
        payload: { start_date: newStart },
      });
    } else if (type === "right") {
      const newEnd = addDays(sprint.end_date, days);
      if (newEnd < sprint.start_date) return;
      updateSprint.mutate({
        id: sprint.id,
        payload: { end_date: newEnd },
      });
    }
  };

  if (activeProjectId == null) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold text-white">Roadmap</h1>
        <p className="mt-2 text-sm text-gray-500">
          Select a project from the sidebar to view its roadmap.
        </p>
      </div>
    );
  }

  const list = sprints ?? [];
  const todayLeft = LABEL_WIDTH + dateToPx(today, origin, scale);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-white">Roadmap</h1>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-md border border-gray-700 bg-gray-800 p-0.5">
            {SCALES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setScale(s.value)}
                className={cn(
                  "px-3 py-1 text-xs rounded transition-colors",
                  scale === s.value
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-gray-200",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 text-white">
            <Plus className="h-4 w-4" />
            Create sprint
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-700 p-12 text-center">
          <p className="text-sm text-gray-500">No sprints to display.</p>
          <Button
            variant="outline"
            onClick={openCreate}
            className="mt-4 bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            Create the first sprint
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div
          ref={scrollRef}
          onWheel={handleWheel}
          className="flex-1 min-h-0 overflow-auto bg-gray-900 rounded-lg border border-gray-800"
        >
          <div
            className="relative"
            style={{ width: LABEL_WIDTH + totalPx, minWidth: "100%" }}
          >
            <div
              className="sticky top-0 z-30 flex bg-gray-950 border-b border-gray-800"
              style={{ height: HEADER_HEIGHT }}
            >
              <div
                className="sticky left-0 z-40 shrink-0 bg-gray-950 border-r border-gray-800"
                style={{ width: LABEL_WIDTH }}
              />
              <div className="relative" style={{ width: totalPx }}>
                <TimelineHeader origin={origin} end={end} scale={scale} />
              </div>
            </div>

            <div className="relative">
              {list.map((s) => (
                <div
                  key={s.id}
                  className="flex border-b border-gray-800/60"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div
                    className="sticky left-0 z-20 shrink-0 bg-gray-900 border-r border-gray-800 px-3 py-2 flex flex-col justify-center"
                    style={{ width: LABEL_WIDTH }}
                  >
                    <span className="text-sm font-medium text-white truncate">
                      {s.name}
                    </span>
                    <span
                      className={cn(
                        "mt-1 self-start text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                        STATUS_BADGE[s.status as SprintStatus],
                      )}
                    >
                      {STATUS_LABELS[s.status as SprintStatus]}
                    </span>
                  </div>
                  <div className="relative flex-1" style={{ minWidth: totalPx }}>
                    <TimelineBar
                      sprint={s}
                      origin={origin}
                      scale={scale}
                      onOpen={openEdit}
                    />
                  </div>
                </div>
              ))}
              <TodayIndicator left={todayLeft} />
            </div>
          </div>
        </div>
        </DndContext>
      )}

      <SprintFormDialog
        open={modalOpen}
        onOpenChange={handleModalClose}
        projectId={activeProjectId}
        editing={editing}
      />
    </div>
  );
}
