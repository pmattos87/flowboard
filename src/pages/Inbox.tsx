import { useEffect, useMemo, useState } from "react";
import { SkeletonRow } from "@/components/Skeleton";
import { MessageSquare, GitCommitHorizontal, UserCheck } from "lucide-react";
import { useAllActivityLog } from "@/hooks/useActivityLog";
import { useTasks } from "@/hooks/useTasks";
import { usePeople } from "@/hooks/usePeople";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

const LAST_VISIT_KEY = "lastInboxVisit";

function getLastVisit(): string {
  return localStorage.getItem(LAST_VISIT_KEY) ?? new Date(0).toISOString();
}

function setLastVisit() {
  localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
}

function actionLabel(action: string, newValue: string): string {
  switch (action) {
    case "created":
      return "created task";
    case "status_changed":
      return `changed status to ${newValue.replace("_", " ")}`;
    case "assigned":
      return `assigned task to ${newValue}`;
    default:
      return action.replace("_", " ");
  }
}

function ActionIcon({ action }: { action: string }) {
  if (action === "status_changed") {
    return <GitCommitHorizontal className="h-4 w-4 text-blue-400 shrink-0" />;
  }
  if (action === "assigned") {
    return <UserCheck className="h-4 w-4 text-emerald-400 shrink-0" />;
  }
  return <MessageSquare className="h-4 w-4 text-gray-400 shrink-0" />;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Inbox() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const { data: logs = [], isLoading } = useAllActivityLog();
  const { data: tasks = [] } = useTasks(
    activeProjectId != null ? { project_id: activeProjectId } : undefined,
  );
  const { data: people = [] } = usePeople();

  // Capture the "last visited" timestamp once at mount, before marking as read.
  // Using useState initializer ensures it never changes across re-renders.
  const [lastVisit] = useState(getLastVisit);

  // Mark all as read after capturing the snapshot
  useEffect(() => {
    setLastVisit();
  }, []);

  const taskMap = useMemo(
    () => new Map(tasks.map((t) => [t.id, t.title])),
    [tasks],
  );
  const personMap = useMemo(
    () => new Map(people.map((p) => [p.id, p.name])),
    [people],
  );

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-xl font-semibold text-white">Inbox</h1>

      {isLoading ? (
        <div className="space-y-1">{Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}</div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-500">No activity yet.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {logs.map((entry) => {
            const isUnread = entry.created_at > lastVisit;
            const taskTitle =
              taskMap.get(entry.task_id) ?? `Task #${entry.task_id}`;
            const personName =
              personMap.get(entry.person_id) ?? `Person #${entry.person_id}`;

            return (
              <div
                key={entry.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg px-4 py-3 bg-gray-800",
                  isUnread && "border-l-2 border-blue-500",
                )}
              >
                <ActionIcon action={entry.action} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-100 leading-snug">
                    <span className="font-medium">{personName}</span>{" "}
                    {actionLabel(entry.action, entry.new_value)}{" "}
                    <span className="text-gray-400 italic truncate">
                      {taskTitle}
                    </span>
                  </p>
                </div>
                <span className="text-xs text-gray-500 shrink-0 pt-0.5">
                  {formatRelative(entry.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
