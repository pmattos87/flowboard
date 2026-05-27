import { create } from "zustand";
import type { TaskStatus } from "@/types";

export type SprintFilter = "all" | "backlog" | number;

export interface CreateTaskPrefill {
  parent_id?: number | null;
  sprint_id?: number | null;
  status?: TaskStatus;
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
}

export const useUiStore = create<UiState>((set) => ({
  activeProjectId: null,
  setActiveProjectId: (id) =>
    set((state) => ({
      activeProjectId: id,
      boardSprintFilter:
        state.activeProjectId === id ? state.boardSprintFilter : "all",
    })),

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
}));
