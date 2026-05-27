import { describe, it, expect, beforeEach } from "vitest";
import { useUiStore } from "@/stores/uiStore";

beforeEach(() => {
  useUiStore.setState({
    activeProjectId: null,
    createProjectModalOpen: false,
    createTaskModalOpen: false,
    createTaskPrefill: null,
    selectedTaskId: null,
    selectedSprintId: null,
    boardSprintFilter: "all",
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

  // ─── Phase 10: board sprint filter ─────────────────────────────────

  it("boardSprintFilter defaults to 'all'", () => {
    expect(useUiStore.getState().boardSprintFilter).toBe("all");
  });

  it("setBoardSprintFilter accepts 'backlog' and a numeric sprint id", () => {
    useUiStore.getState().setBoardSprintFilter("backlog");
    expect(useUiStore.getState().boardSprintFilter).toBe("backlog");
    useUiStore.getState().setBoardSprintFilter(7);
    expect(useUiStore.getState().boardSprintFilter).toBe(7);
  });

  it("switching activeProjectId resets boardSprintFilter to 'all'", () => {
    useUiStore.getState().setActiveProjectId(1);
    useUiStore.getState().setBoardSprintFilter(7);
    expect(useUiStore.getState().boardSprintFilter).toBe(7);

    useUiStore.getState().setActiveProjectId(2);
    expect(useUiStore.getState().boardSprintFilter).toBe("all");
  });

  it("setting activeProjectId to the same id preserves boardSprintFilter", () => {
    useUiStore.getState().setActiveProjectId(1);
    useUiStore.getState().setBoardSprintFilter(7);
    useUiStore.getState().setActiveProjectId(1);
    expect(useUiStore.getState().boardSprintFilter).toBe(7);
  });

  // ─── Phase 10: create-task prefill ─────────────────────────────────

  it("openCreateTaskModal sets prefill and opens the modal in one update", () => {
    useUiStore.getState().openCreateTaskModal({
      parent_id: 42,
      sprint_id: 5,
      status: "in_progress",
    });
    const state = useUiStore.getState();
    expect(state.createTaskModalOpen).toBe(true);
    expect(state.createTaskPrefill).toEqual({
      parent_id: 42,
      sprint_id: 5,
      status: "in_progress",
    });
  });

  it("setCreateTaskModalOpen(false) clears the prefill", () => {
    useUiStore.getState().openCreateTaskModal({ parent_id: 42 });
    useUiStore.getState().setCreateTaskModalOpen(false);
    expect(useUiStore.getState().createTaskPrefill).toBeNull();
    expect(useUiStore.getState().createTaskModalOpen).toBe(false);
  });
});
