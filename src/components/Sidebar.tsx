import { NavLink } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  Info,
  Inbox,
  Kanban,
  Lightbulb,
  Map as MapIcon,
  Plus,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";
import { useProjects } from "@/hooks/useProjects";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/board/discovery", label: "Discovery Board", icon: Lightbulb },
  { to: "/board/user-story", label: "User Story Board", icon: BookOpen },
  { to: "/board/task", label: "Task Board", icon: Kanban },
  { to: "/board/sprint-planning", label: "Sprint Planning Board", icon: ClipboardList },
  { to: "/roadmap", label: "Roadmap", icon: MapIcon },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/people", label: "People", icon: Users },
  { to: "/inbox", label: "Inbox", icon: Inbox },
];

function navClasses({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
    isActive
      ? "bg-gray-800 text-white"
      : "text-gray-400 hover:bg-gray-900 hover:text-gray-200",
  );
}

export function Sidebar() {
  const { data: projects } = useProjects();
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const setActiveProjectId = useUiStore((s) => s.setActiveProjectId);
  const openCreateProject = useUiStore((s) => s.setCreateProjectModalOpen);

  return (
    <aside className="w-[256px] shrink-0 bg-gray-950 border-r border-gray-900 flex flex-col">
      <div className="h-18 flex items-center justify-center px-4 border-b border-gray-900">
        <img
          src="/logo.png"
          alt="FlowBoard"
          className="h-32 w-auto object-contain"
        />
      </div>
      {import.meta.env.VITE_APP_ENV === "staging" && (
        <div className="mx-3 mt-1 px-2 py-0.5 rounded text-[10px] font-semibold tracking-widest text-amber-400 bg-amber-900/30 border border-amber-800/40 text-center">
          STAGING
        </div>
      )}

      <div className="px-3 pt-4 pb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
          Projects
        </span>
        <button
          type="button"
          onClick={() => openCreateProject(true)}
          aria-label="Create project"
          className="text-gray-500 hover:text-gray-200 transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <ul className="px-2 space-y-0.5">
        {(projects ?? []).map((p) => {
          const isActive = activeProjectId === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setActiveProjectId(p.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left",
                  isActive
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:bg-gray-900 hover:text-gray-200",
                )}
              >
                <span
                  className="h-5 w-5 rounded-sm shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="truncate">{p.name}</span>
              </button>
            </li>
          );
        })}
        {projects && projects.length === 0 && (
          <li className="px-2 py-1.5 text-xs text-gray-600 italic">
            No projects yet
          </li>
        )}
      </ul>

      <nav className="mt-6 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={navClasses}>
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto p-2 border-t border-gray-900 space-y-0.5">
        <NavLink to="/settings" className={navClasses}>
          <SettingsIcon className="h-4 w-4" />
          <span>Settings</span>
        </NavLink>
        <NavLink to="/about" className={navClasses}>
          <Info className="h-4 w-4" />
          <span>About</span>
        </NavLink>
      </div>
    </aside>
  );
}
