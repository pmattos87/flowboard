import { useRef, useState } from "react";
import { Bell, Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePeople } from "@/hooks/usePeople";
import { useProject } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";
import { useAllActivityLog } from "@/hooks/useActivityLog";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";

const LAST_VISIT_KEY = "lastInboxVisit";

function getUnreadCount(logs: { created_at: string }[]): number {
  const lastVisit =
    localStorage.getItem(LAST_VISIT_KEY) ?? new Date(0).toISOString();
  return logs.filter((e) => e.created_at > lastVisit).length;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

const STATUS_COLORS: Record<string, string> = {
  todo: "text-gray-400",
  in_progress: "text-blue-400",
  in_review: "text-yellow-400",
  done: "text-emerald-400",
};

function SearchResults({
  results,
  onSelect,
}: {
  results: Task[];
  onSelect: (task: Task) => void;
}) {
  return (
    <div className="absolute top-full mt-1 left-0 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
      {results.map((task) => (
        <button
          key={task.id}
          type="button"
          onMouseDown={(e) => {
            // prevent input blur before click fires
            e.preventDefault();
            onSelect(task);
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-700 transition-colors"
        >
          <Search className="h-3.5 w-3.5 text-gray-500 shrink-0" />
          <span className="flex-1 text-sm text-gray-100 truncate">{task.title}</span>
          <span className={cn("text-xs shrink-0", STATUS_COLORS[task.status])}>
            {STATUS_LABELS[task.status]}
          </span>
        </button>
      ))}
    </div>
  );
}

export function TopBar() {
  const navigate = useNavigate();
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const setCreateTaskModalOpen = useUiStore((s) => s.setCreateTaskModalOpen);
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId);
  const { data: activeProject } = useProject(activeProjectId);
  const { data: people } = usePeople();
  const { data: activityLogs = [] } = useAllActivityLog();
  const { data: tasks = [] } = useTasks(
    activeProjectId != null ? { project_id: activeProjectId } : undefined,
  );
  const avatars = (people ?? []).slice(0, 4);
  const unreadCount = getUnreadCount(activityLogs);

  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results =
    query.length >= 2
      ? tasks
          .filter((t) => t.title.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 8)
      : [];

  const handleSelect = (task: Task) => {
    setSelectedTaskId(task.id);
    setQuery("");
    setShowResults(false);
  };

  return (
    <header className="h-12 shrink-0 bg-gray-900 border-b border-gray-900 flex items-center px-4 gap-4">
      <div className="flex items-center gap-2 min-w-0">
        {activeProject ? (
          <>
            <span
              className="h-4 w-4 rounded-sm shrink-0"
              style={{ backgroundColor: activeProject.color }}
            />
            <span className="text-sm font-medium text-gray-100 truncate">
              {activeProject.name}
            </span>
          </>
        ) : (
          <span className="text-sm text-gray-500">No project selected</span>
        )}
      </div>

      <div className="flex-1 flex justify-center">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
          <input
            ref={inputRef}
            id="global-search"
            type="text"
            placeholder="Search tasks… ( / )"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            onBlur={() => setShowResults(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                setShowResults(false);
                inputRef.current?.blur();
              }
            }}
            className="w-full bg-gray-800 text-sm text-gray-100 placeholder:text-gray-500 rounded-md pl-8 pr-3 py-1.5 outline-none focus:ring-1 focus:ring-gray-700"
          />
          {showResults && results.length > 0 && (
            <SearchResults results={results} onSelect={handleSelect} />
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md px-3 py-1.5 transition-colors"
          onClick={() => setCreateTaskModalOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Create
        </button>

        <button
          type="button"
          aria-label="Notifications"
          onClick={() => navigate("/inbox")}
          className="relative text-gray-400 hover:text-gray-200 transition-colors"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-600 text-[10px] font-bold text-white flex items-center justify-center leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {avatars.length > 0 && (
          <div className="flex -space-x-2">
            {avatars.map((person) => (
              <div
                key={person.id}
                title={person.name}
                className={cn(
                  "h-7 w-7 rounded-full ring-2 ring-gray-900",
                  "flex items-center justify-center text-[10px] font-semibold text-white",
                )}
                style={{ backgroundColor: person.avatar_color }}
              >
                {initials(person.name)}
              </div>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
