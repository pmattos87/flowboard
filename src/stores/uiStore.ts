import { create } from "zustand";

interface UiState {
  activeProjectId: number | null;
  setActiveProjectId: (id: number | null) => void;

  createProjectModalOpen: boolean;
  setCreateProjectModalOpen: (open: boolean) => void;

  createTaskModalOpen: boolean;
  setCreateTaskModalOpen: (open: boolean) => void;

  selectedTaskId: number | null;
  setSelectedTaskId: (id: number | null) => void;

  selectedSprintId: number | null;
  setSelectedSprintId: (id: number | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeProjectId: null,
  setActiveProjectId: (id) => set({ activeProjectId: id }),

  createProjectModalOpen: false,
  setCreateProjectModalOpen: (open) => set({ createProjectModalOpen: open }),

  createTaskModalOpen: false,
  setCreateTaskModalOpen: (open) => set({ createTaskModalOpen: open }),

  selectedTaskId: null,
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),

  selectedSprintId: null,
  setSelectedSprintId: (id) => set({ selectedSprintId: id }),
}));
