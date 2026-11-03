import { create } from "zustand";
import type { TaskStatus, TaskType } from "@/types";

export type SprintFilter = "all" | "backlog" | number;

/** How the Factory Discovery board groups its cards (FB-224). Session-only, never persisted. */
export type DiscoveryGrouping = "none" | "epic";

export interface CreateTaskPrefill {
  parent_id?: number | null;
  sprint_id?: number | null;
  status?: TaskStatus;
  type?: TaskType;
  lockType?: boolean;
}

interface UiState {
  activeProjectId: number | null;
  setActiveProjectId: (id: number | null) => void;

  createProjectModalOpen: boolean;
  setCreateProjectModalOpen: (open: boolean) => void;

  createTaskModalOpen: boolean;
  setCreateTaskModalOpen: (open: boolean) => void;

  createTaskPrefill: CreateTaskPrefill | null;
  openCreateTaskModal: (prefill?: CreateTaskPrefill) => void;
  clearCreateTaskPrefill: () => void;

  selectedTaskId: number | null;
  setSelectedTaskId: (id: number | null) => void;

  selectedSprintId: number | null;
  setSelectedSprintId: (id: number | null) => void;

  boardSprintFilter: SprintFilter;
  setBoardSprintFilter: (f: SprintFilter) => void;

  // Which project the current boardSprintFilter was resolved for. Used to apply
  // the "default to active sprint" rule once per project without clobbering a
  // later manual choice when SprintFilterSelect remounts (e.g. switching boards).
  boardSprintFilterFor: number | null;
  ensureDefaultSprintFilter: (projectId: number, activeSprintId: number | null) => void;

  discoveryGrouping: DiscoveryGrouping;
  setDiscoveryGrouping: (g: DiscoveryGrouping) => void;
  toggleDiscoveryGrouping: () => void;

  /** Sidebar client groups the user collapsed (FB-202). Absent = expanded. Session-only. */
  collapsedClientIds: Record<number, true>;
  toggleClientExpanded: (clientId: number) => void;

  /** Sidebar groups whose "Archived (n)" row is open (FB-14). Absent = collapsed. Session-only. */
  openArchivedGroups: Partial<Record<ArchivedGroupKey, true>>;
  toggleArchivedOpen: (group: ArchivedGroupKey) => void;

  /** Board label filter per project id (FB-99). Session-only, never persisted; a missing entry means no filter. */
  labelFilters: Record<number, string>;
  /** Sets one project's label filter; null clears it. */
  setLabelFilter: (projectId: number, label: string | null) => void;
}

/** A sidebar group: the Internal section, or a client group by client id. */
export type ArchivedGroupKey = "internal" | number;

/** A group's Archived row is collapsed unless the user opened it. */
export const isArchivedOpen = (state: Pick<UiState, "openArchivedGroups">, group: ArchivedGroupKey) =>
  state.openArchivedGroups[group] === true;

/** A client group is expanded unless the user collapsed it, so new clients start expanded. */
export const isClientExpanded = (state: Pick<UiState, "collapsedClientIds">, clientId: number) =>
  !state.collapsedClientIds[clientId];

export const useUiStore = create<UiState>((set) => ({
  activeProjectId: null,
  setActiveProjectId: (id) =>
    set((state) =>
      state.activeProjectId === id
        ? { activeProjectId: id }
        : { activeProjectId: id, boardSprintFilter: "all", boardSprintFilterFor: null }
    ),

  createProjectModalOpen: false,
  setCreateProjectModalOpen: (open) => set({ createProjectModalOpen: open }),

  createTaskModalOpen: false,
  setCreateTaskModalOpen: (open) =>
    set(
      open
        ? { createTaskModalOpen: true }
        : { createTaskModalOpen: false, createTaskPrefill: null }
    ),

  createTaskPrefill: null,
  openCreateTaskModal: (prefill) =>
    set({ createTaskModalOpen: true, createTaskPrefill: prefill ?? null }),
  clearCreateTaskPrefill: () => set({ createTaskPrefill: null }),

  selectedTaskId: null,
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),

  selectedSprintId: null,
  setSelectedSprintId: (id) => set({ selectedSprintId: id }),

  boardSprintFilter: "all",
  setBoardSprintFilter: (f) => set({ boardSprintFilter: f }),

  boardSprintFilterFor: null,
  ensureDefaultSprintFilter: (projectId, activeSprintId) =>
    set((state) =>
      state.boardSprintFilterFor === projectId
        ? state
        : {
            boardSprintFilter: activeSprintId ?? "all",
            boardSprintFilterFor: projectId,
          }
    ),

  discoveryGrouping: "none",
  setDiscoveryGrouping: (g) => set({ discoveryGrouping: g }),
  toggleDiscoveryGrouping: () =>
    set((state) => ({ discoveryGrouping: state.discoveryGrouping === "none" ? "epic" : "none" })),

  collapsedClientIds: {},
  toggleClientExpanded: (clientId) =>
    set((state) => {
      const next = { ...state.collapsedClientIds };
      if (next[clientId]) delete next[clientId];
      else next[clientId] = true;
      return { collapsedClientIds: next };
    }),

  openArchivedGroups: {},
  toggleArchivedOpen: (group) =>
    set((state) => {
      const next = { ...state.openArchivedGroups };
      if (next[group]) delete next[group];
      else next[group] = true;
      return { openArchivedGroups: next };
    }),

  labelFilters: {},
  setLabelFilter: (projectId, label) =>
    set((state) => {
      const next = { ...state.labelFilters };
      if (label === null) delete next[projectId];
      else next[projectId] = label;
      return { labelFilters: next };
    }),
}));

/** Selector for one project's label filter: `useUiStore(selectLabelFilter(id))`. Null when none is set. */
export const selectLabelFilter =
  (projectId: number | null) =>
  (state: UiState): string | null =>
    projectId == null ? null : state.labelFilters[projectId] ?? null;
