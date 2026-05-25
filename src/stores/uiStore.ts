import { create } from "zustand";

interface UiState {
  activeProjectId: number | null;
  setActiveProjectId: (id: number | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeProjectId: null,
  setActiveProjectId: (id) => set({ activeProjectId: id }),
}));
