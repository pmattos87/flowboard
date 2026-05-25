import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import React from "react";
import { useTasks, useTask, useCreateTask, useDeleteTask, taskKeys } from "@/hooks/useTasks";

const mockInvoke = vi.mocked(invoke);

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
    qc,
  };
}

beforeEach(() => mockInvoke.mockReset());

const fakeTask = {
  id: 1,
  project_id: 10,
  sprint_id: null,
  parent_id: null,
  title: "Fix bug",
  description: "",
  type: "task",
  status: "todo",
  priority: "medium",
  assignee_id: null,
  story_points: 0,
  due_date: null,
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
  labels: "",
};

describe("useTasks", () => {
  it("fetches all tasks when no filters provided", async () => {
    mockInvoke.mockResolvedValueOnce([fakeTask]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("list_tasks", { filters: null });
  });

  it("fetches with filters when provided", async () => {
    mockInvoke.mockResolvedValueOnce([fakeTask]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTasks({ project_id: 10, status: "todo" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("list_tasks", {
      filters: { project_id: 10, status: "todo" },
    });
  });

  it("uses different query keys for different filters", () => {
    expect(taskKeys.list({ project_id: 1 })).not.toEqual(taskKeys.list({ project_id: 2 }));
  });
});

describe("useTask", () => {
  it("does not fetch when id is null", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTask(null), { wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches when id is provided", async () => {
    mockInvoke.mockResolvedValueOnce(fakeTask);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTask(1), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("get_task", { id: 1 });
  });
});

describe("useCreateTask", () => {
  it("calls createTask and invalidates taskKeys.all", async () => {
    mockInvoke.mockResolvedValueOnce(fakeTask);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateTask(), { wrapper });
    await result.current.mutateAsync({ project_id: 10, title: "Fix bug" });
    expect(mockInvoke).toHaveBeenCalledWith("create_task", {
      payload: { project_id: 10, title: "Fix bug" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: taskKeys.all });
  });
});

describe("useDeleteTask", () => {
  it("calls deleteTask and invalidates taskKeys.all", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteTask(), { wrapper });
    await result.current.mutateAsync(1);
    expect(mockInvoke).toHaveBeenCalledWith("delete_task", { id: 1 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: taskKeys.all });
  });
});
