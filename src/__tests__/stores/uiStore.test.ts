import { describe, it, expect, beforeEach } from "vitest";
import { useUiStore } from "@/stores/uiStore";

beforeEach(() => {
  useUiStore.setState({
    activeProjectId: null,
    createProjectModalOpen: false,
    createTaskModalOpen: false,
    selectedTaskId: null,
    selectedSprintId: null,
  });
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

  it("selectedSprintId starts as null", () => {
    expect(useUiStore.getState().selectedSprintId).toBeNull();
  });

  it("setSelectedSprintId sets a sprint id", () => {
    useUiStore.getState().setSelectedSprintId(5);
    expect(useUiStore.getState().selectedSprintId).toBe(5);
  });

  it("setSelectedSprintId clears back to null", () => {
    useUiStore.getState().setSelectedSprintId(5);
    useUiStore.getState().setSelectedSprintId(null);
    expect(useUiStore.getState().selectedSprintId).toBeNull();
  });
});
