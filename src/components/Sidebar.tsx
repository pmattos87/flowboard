import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Info,
  Inbox,
  Kanban,
  Lightbulb,
  Map as MapIcon,
  Package,
  Pencil,
  Plus,
  Settings as SettingsIcon,
  Workflow,
  Users,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useProjects, useReorderProjects } from "@/hooks/useProjects";
import {
  useClients,
  useCreateClient,
  useRenameClient,
  useReorderClients,
} from "@/hooks/useClients";
import { ProjectBadge } from "@/components/ProjectBadge";
import { BackupWarning } from "@/components/BackupWarning";
import { ClientNameDialog } from "@/components/ClientNameDialog";
import { isClientExpanded, useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import type { Client, Project } from "@/types";

const NAV_ITEMS = [
  { to: "/board/discovery", label: "Discovery Board", icon: Lightbulb },
  { to: "/board/user-story", label: "User Story Board", icon: BookOpen },
  { to: "/board/task", label: "Task Board", icon: Kanban },
  { to: "/board/sprint-planning", label: "Sprint Planning Board", icon: ClipboardList },
  { to: "/roadmap", label: "Roadmap", icon: MapIcon },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/releases", label: "Releases", icon: Package },
  { to: "/runs", label: "Active Runs", icon: Workflow },
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

/**
 * What each sortable carries: its kind and the group it may be reordered within.
 * Projects group by client ("internal" or "client-<id>"); clients form one "clients" group.
 */
interface SortData {
  kind: "project" | "client";
  id: number;
  group: string;
}

const projectGroup = (clientId: number | null) =>
  clientId == null ? "internal" : `client-${clientId}`;

/** Only items in the dragged item's own group are drop targets, so nothing crosses groups. */
const sameGroupCollision: CollisionDetection = (args) => {
  const group = (args.active.data.current as SortData | undefined)?.group;
  return rectIntersection({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (c) => (c.data.current as SortData | undefined)?.group === group,
    ),
  });
};

/** dnd-kit moves sortables with a computed transform, which Tailwind classes cannot express. */
function sortableStyle(
  transform: ReturnType<typeof useSortable>["transform"],
  transition: string | undefined,
  isDragging: boolean,
) {
  return {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };
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
  const data: SortData = { kind: "project", id: project.id, group: projectGroup(project.client_id) };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `project-${project.id}`, data });

  return (
    <li ref={setNodeRef} style={sortableStyle(transform, transition, isDragging)}>
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

/** One group's projects, sortable among themselves only. */
function ProjectList({ projects, className }: { projects: Project[]; className?: string }) {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const setActiveProjectId = useUiStore((s) => s.setActiveProjectId);
  return (
    <SortableContext
      items={projects.map((p) => `project-${p.id}`)}
      strategy={verticalListSortingStrategy}
    >
      <ul className={cn("space-y-0.5", className)}>
        {projects.map((p) => (
          <SortableProjectItem
            key={p.id}
            project={p}
            isActive={activeProjectId === p.id}
            onSelect={() => setActiveProjectId(p.id)}
          />
        ))}
      </ul>
    </SortableContext>
  );
}

function SortableClientGroup({ client, projects }: { client: Client; projects: Project[] }) {
  const expanded = useUiStore((s) => isClientExpanded(s, client.id));
  const toggleExpanded = useUiStore((s) => s.toggleClientExpanded);
  const data: SortData = { kind: "client", id: client.id, group: "clients" };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `client-${client.id}`, data });
  const renameClient = useRenameClient();
  const [renaming, setRenaming] = useState(false);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const listId = `client-${client.id}-projects`;

  return (
    <li ref={setNodeRef} style={sortableStyle(transform, transition, isDragging)}>
      <div className="group flex items-center rounded-md hover:bg-gray-900">
        {/* Only this button carries the drag listeners, so the rename button never starts a drag. */}
        <button
          type="button"
          onClick={() => toggleExpanded(client.id)}
          {...attributes}
          {...listeners}
          aria-expanded={expanded}
          aria-controls={listId}
          className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm text-gray-300 hover:text-gray-100 transition-colors text-left touch-none"
        >
          <Chevron className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
          <span className="truncate">{client.name}</span>
        </button>
        <button
          type="button"
          onClick={() => setRenaming(true)}
          aria-label={`Rename ${client.name}`}
          className="mr-1 p-1 rounded text-gray-500 hover:text-gray-200 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-opacity"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
      <ClientNameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename client"
        submitLabel="Save"
        initialName={client.name}
        isPending={renameClient.isPending}
        onSubmit={(name) => renameClient.mutateAsync({ id: client.id, name })}
      />
      {expanded && (
        <div id={listId}>
          {projects.length > 0 ? (
            <ProjectList projects={projects} className="pl-4" />
          ) : (
            <p className="pl-8 py-1 text-xs text-gray-600 italic">No projects</p>
          )}
        </div>
      )}
    </li>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="px-2 text-[10px] font-semibold tracking-wider text-gray-600 uppercase">
      {children}
    </span>
  );
}

export function Sidebar() {
  const { data: projects } = useProjects();
  const { data: clients } = useClients();
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const openCreateProject = useUiStore((s) => s.setCreateProjectModalOpen);
  const reorderProjects = useReorderProjects();
  const reorderClients = useReorderClients();
  const createClient = useCreateClient();
  const [creatingClient, setCreatingClient] = useState(false);

  // 5px activation distance so a plain click still selects (no accidental drag).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const projectList = projects ?? [];
  const clientList = clients ?? [];
  const internalProjects = projectList.filter((p) => p.client_id == null);
  // On a Factory project the Task board lives on each Story page (SF-61).
  const isFactory = projectList.find((p) => p.id === activeProjectId)?.ladder === "factory";
  const navItems = isFactory ? NAV_ITEMS.filter((i) => i.to !== "/board/task") : NAV_ITEMS;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const from = active.data.current as SortData | undefined;
    const to = over?.data.current as SortData | undefined;
    if (!from || !to || from.id === to.id || from.group !== to.group) return;
    // Send only the dragged item's group: the backend positions just the ids it is given.
    const items: { id: number }[] =
      from.kind === "client"
        ? clientList
        : projectList.filter((p) => projectGroup(p.client_id) === from.group);
    const oldIndex = items.findIndex((i) => i.id === from.id);
    const newIndex = items.findIndex((i) => i.id === to.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const orderedIds = arrayMove(items, oldIndex, newIndex).map((i) => i.id);
    if (from.kind === "client") reorderClients.mutate(orderedIds);
    else reorderProjects.mutate(orderedIds);
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
      <DndContext
        sensors={sensors}
        collisionDetection={sameGroupCollision}
        onDragEnd={handleDragEnd}
      >
        <section aria-label="Internal" className="px-2">
          <SectionLabel>Internal</SectionLabel>
          <ProjectList projects={internalProjects} className="mt-1" />
          {projects && projects.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-gray-600 italic">No projects yet</p>
          )}
        </section>
        <section aria-label="Clients" className="px-2 mt-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Clients</SectionLabel>
            <button
              type="button"
              onClick={() => setCreatingClient(true)}
              aria-label="Create client"
              className="mr-1 rounded text-gray-500 hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <SortableContext
            items={clientList.map((c) => `client-${c.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="mt-1 space-y-0.5">
              {clientList.map((c) => (
                <SortableClientGroup
                  key={c.id}
                  client={c}
                  projects={projectList.filter((p) => p.client_id === c.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </section>
      </DndContext>
      <ClientNameDialog
        open={creatingClient}
        onOpenChange={setCreatingClient}
        title="Create client"
        submitLabel="Create client"
        isPending={createClient.isPending}
        onSubmit={(name) => createClient.mutateAsync(name)}
      />

      <nav className="mt-6 px-2 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={navClasses}>
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <BackupWarning />

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
