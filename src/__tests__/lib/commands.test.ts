import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  listSprints,
  listTasks,
  createTask,
  deleteTask,
  createPerson,
  listPeople,
} from "@/lib/commands";

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("project commands", () => {
  it("createProject calls invoke with correct command and payload", async () => {
    const payload = { name: "Alpha", key: "AL", description: "desc", color: "#fff" };
    mockInvoke.mockResolvedValueOnce({ id: 1, ...payload, created_at: "" });
    await createProject(payload);
    expect(mockInvoke).toHaveBeenCalledWith("create_project", { payload });
  });

  it("listProjects calls invoke with no args", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    await listProjects();
    expect(mockInvoke).toHaveBeenCalledWith("list_projects");
  });

  it("getProject calls invoke with id", async () => {
    mockInvoke.mockResolvedValueOnce({ id: 3 });
    await getProject(3);
    expect(mockInvoke).toHaveBeenCalledWith("get_project", { id: 3 });
  });

  it("updateProject calls invoke with id and payload", async () => {
    mockInvoke.mockResolvedValueOnce({ id: 3 });
    await updateProject(3, { name: "New" });
    expect(mockInvoke).toHaveBeenCalledWith("update_project", { id: 3, payload: { name: "New" } });
  });

  it("deleteProject calls invoke with id", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await deleteProject(3);
    expect(mockInvoke).toHaveBeenCalledWith("delete_project", { id: 3 });
  });
});

describe("sprint commands", () => {
  it("listSprints passes null when projectId is undefined", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    await listSprints(undefined);
    expect(mockInvoke).toHaveBeenCalledWith("list_sprints", { projectId: null });
  });

  it("listSprints passes the projectId when provided", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    await listSprints(2);
    expect(mockInvoke).toHaveBeenCalledWith("list_sprints", { projectId: 2 });
  });
});

describe("task commands", () => {
  it("listTasks passes null when no filters provided", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    await listTasks();
    expect(mockInvoke).toHaveBeenCalledWith("list_tasks", { filters: null });
  });

  it("listTasks passes filter object when provided", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    await listTasks({ project_id: 1, status: "todo" });
    expect(mockInvoke).toHaveBeenCalledWith("list_tasks", {
      filters: { project_id: 1, status: "todo" },
    });
  });

  it("createTask calls invoke with payload", async () => {
    const payload = { project_id: 1, title: "T1" };
    mockInvoke.mockResolvedValueOnce({ id: 10 });
    await createTask(payload);
    expect(mockInvoke).toHaveBeenCalledWith("create_task", { payload });
  });

  it("deleteTask calls invoke with id", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await deleteTask(7);
    expect(mockInvoke).toHaveBeenCalledWith("delete_task", { id: 7 });
  });
});

describe("people commands", () => {
  it("createPerson calls invoke with payload", async () => {
    const payload = { name: "Alice", email: "alice@ex.com" };
    mockInvoke.mockResolvedValueOnce({ id: 1 });
    await createPerson(payload);
    expect(mockInvoke).toHaveBeenCalledWith("create_person", { payload });
  });

  it("listPeople calls invoke with no args", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    await listPeople();
    expect(mockInvoke).toHaveBeenCalledWith("list_people");
  });
});
