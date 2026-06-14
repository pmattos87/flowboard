import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import React from "react";
import {
  useProjects,
  useProject,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useReorderProjects,
  projectKeys,
} from "@/hooks/useProjects";

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

const fakeProject = {
  id: 1,
  name: "Alpha",
  key: "AL",
  description: "",
  color: "#6366f1",
  created_at: "2024-01-01T00:00:00.000Z",
};

describe("useProjects", () => {
  it("fetches and returns project list", async () => {
    mockInvoke.mockResolvedValueOnce([fakeProject]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProjects(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([fakeProject]);
    expect(mockInvoke).toHaveBeenCalledWith("list_projects");
  });
});

describe("useProject", () => {
  it("does not fetch when id is null", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProject(null), { wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("does not fetch when id is undefined", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProject(undefined), { wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches when id is provided", async () => {
    mockInvoke.mockResolvedValueOnce(fakeProject);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProject(1), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("get_project", { id: 1 });
  });
});

describe("useCreateProject", () => {
  it("calls createProject command and invalidates projectKeys.all", async () => {
    mockInvoke.mockResolvedValueOnce(fakeProject);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateProject(), { wrapper });
    await result.current.mutateAsync({ name: "Alpha", key: "AL" });
    expect(mockInvoke).toHaveBeenCalledWith("create_project", {
      payload: { name: "Alpha", key: "AL" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectKeys.all });
  });
});

describe("useUpdateProject", () => {
  it("calls updateProject and invalidates cache", async () => {
    mockInvoke.mockResolvedValueOnce(fakeProject);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateProject(), { wrapper });
    await result.current.mutateAsync({ id: 1, payload: { name: "Beta" } });
    expect(mockInvoke).toHaveBeenCalledWith("update_project", {
      id: 1,
      payload: { name: "Beta" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectKeys.all });
  });
});

describe("useDeleteProject", () => {
  it("calls deleteProject and invalidates cache", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteProject(), { wrapper });
    await result.current.mutateAsync(1);
    expect(mockInvoke).toHaveBeenCalledWith("delete_project", { id: 1 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectKeys.all });
  });
});

describe("useReorderProjects", () => {
  it("calls reorder_projects with the new id order", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useReorderProjects(), { wrapper });
    await result.current.mutateAsync([3, 1, 2]);
    expect(mockInvoke).toHaveBeenCalledWith("reorder_projects", {
      orderedIds: [3, 1, 2],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectKeys.all });
  });

  it("optimistically reorders the cached project list", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { wrapper, qc } = makeWrapper();
    qc.setQueryData(projectKeys.list(), [
      { ...fakeProject, id: 1 },
      { ...fakeProject, id: 2 },
      { ...fakeProject, id: 3 },
    ]);
    const { result } = renderHook(() => useReorderProjects(), { wrapper });
    await result.current.mutateAsync([3, 1, 2]);
    const cached = qc.getQueryData<{ id: number }[]>(projectKeys.list());
    expect(cached?.map((p) => p.id)).toEqual([3, 1, 2]);
  });
});
