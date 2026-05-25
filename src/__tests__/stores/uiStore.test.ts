import { describe, it, expect, beforeEach } from "vitest";
import { useUiStore } from "@/stores/uiStore";

beforeEach(() => {
  useUiStore.setState({ activeProjectId: null, createProjectModalOpen: false });
});

describe("uiStore", () => {
  it("has correct initial state", () => {
    const state = useUiStore.getState();
    expect(state.activeProjectId).toBeNull();
    expect(state.createProjectModalOpen).toBe(false);
  });

  it("setActiveProjectId sets a project id", () => {
    useUiStore.getState().setActiveProjectId(5);
    expect(useUiStore.getState().activeProjectId).toBe(5);
  });

  it("setActiveProjectId clears back to null", () => {
    useUiStore.getState().setActiveProjectId(5);
    useUiStore.getState().setActiveProjectId(null);
    expect(useUiStore.getState().activeProjectId).toBeNull();
  });

  it("setCreateProjectModalOpen sets true", () => {
    useUiStore.getState().setCreateProjectModalOpen(true);
    expect(useUiStore.getState().createProjectModalOpen).toBe(true);
  });

  it("setCreateProjectModalOpen toggles back to false", () => {
    useUiStore.getState().setCreateProjectModalOpen(true);
    useUiStore.getState().setCreateProjectModalOpen(false);
    expect(useUiStore.getState().createProjectModalOpen).toBe(false);
  });
});
