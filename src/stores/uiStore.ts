import { create } from "zustand";

interface UiState {
  activeProjectId: number | null;
  setActiveProjectId: (id: number | null) => void;

  createProjectModalOpen: boolean;
  setCreateProjectModalOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeProjectId: null,
  setActiveProjectId: (id) => set({ activeProjectId: id }),

  createProjectModalOpen: false,
  setCreateProjectModalOpen: (open) => set({ createProjectModalOpen: open }),
}));
