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
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useProjects, useReorderProjects } from "@/hooks/useProjects";
import { ProjectBadge } from "@/components/ProjectBadge";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

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

function SortableProjectItem({
  project,
  isActive,
  onSelect,
}: {
  project: Project;
  isActive: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
        opacity: isDragging ? 0.5 : undefined,
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        {...attributes}
        {...listeners}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left touch-none",
          isActive
            ? "bg-gray-800 text-white"
            : "text-gray-400 hover:bg-gray-900 hover:text-gray-200",
        )}
      >
        <ProjectBadge project={project} />
        <span className="truncate">{project.name}</span>
      </button>
    </li>
  );
}

export function Sidebar() {
  const { data: projects } = useProjects();
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const setActiveProjectId = useUiStore((s) => s.setActiveProjectId);
  const openCreateProject = useUiStore((s) => s.setCreateProjectModalOpen);
  const reorderProjects = useReorderProjects();

  // 5px activation distance so a plain click still selects (no accidental drag).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const projectList = projects ?? [];

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = projectList.findIndex((p) => p.id === active.id);
    const newIndex = projectList.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const orderedIds = arrayMove(projectList, oldIndex, newIndex).map((p) => p.id);
    reorderProjects.mutate(orderedIds);
  }

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
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext
          items={projectList.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="px-2 space-y-0.5">
            {projectList.map((p) => (
              <SortableProjectItem
                key={p.id}
                project={p}
                isActive={activeProjectId === p.id}
                onSelect={() => setActiveProjectId(p.id)}
              />
            ))}
            {projects && projects.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-gray-600 italic">
                No projects yet
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>

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
