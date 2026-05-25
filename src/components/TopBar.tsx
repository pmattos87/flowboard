import { Bell, Plus, Search } from "lucide-react";
import { usePeople } from "@/hooks/usePeople";
import { useProject } from "@/hooks/useProjects";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TopBar() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const { data: activeProject } = useProject(activeProjectId);
  const { data: people } = usePeople();
  const avatars = (people ?? []).slice(0, 4);

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
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search…"
            className="w-full bg-gray-800 text-sm text-gray-100 placeholder:text-gray-500 rounded-md pl-8 pr-3 py-1.5 outline-none focus:ring-1 focus:ring-gray-700"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md px-3 py-1.5 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Create
        </button>

        <button
          type="button"
          aria-label="Notifications"
          className="text-gray-400 hover:text-gray-200 transition-colors"
        >
          <Bell className="h-4 w-4" />
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
