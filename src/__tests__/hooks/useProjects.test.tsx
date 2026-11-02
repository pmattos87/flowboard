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
  useSetProjectState,
  projectKeys,
} from "@/hooks/useProjects";
import { storyKeys } from "@/hooks/useStory";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

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

beforeEach(() => {
  mockInvoke.mockReset();
  vi.mocked(toast.error).mockReset();
});

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

  it("a partial reorder keeps the other projects in their own slots (FB-206)", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { wrapper, qc } = makeWrapper();
    qc.setQueryData(projectKeys.list(), [1, 2, 3, 4, 5].map((id) => ({ ...fakeProject, id })));
    const { result } = renderHook(() => useReorderProjects(), { wrapper });
    // One group (ids 2 and 4) swaps; 1, 3 and 5 belong to other groups.
    await result.current.mutateAsync([4, 2]);
    const cached = qc.getQueryData<{ id: number }[]>(projectKeys.list());
    expect(cached?.map((p) => p.id)).toEqual([1, 4, 3, 2, 5]);
  });
});

describe("project client field (FB-202)", () => {
  it("useCreateProject sends client_id and invalidates projectKeys.all", async () => {
    mockInvoke.mockResolvedValueOnce(fakeProject);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateProject(), { wrapper });
    await result.current.mutateAsync({ name: "Alpha", key: "AL", client_id: 4 });
    expect(mockInvoke).toHaveBeenCalledWith("create_project", {
      payload: { name: "Alpha", key: "AL", client_id: 4 },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectKeys.all });
  });

  it("useUpdateProject sends an explicit client_id null to make a project internal", async () => {
    mockInvoke.mockResolvedValueOnce(fakeProject);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateProject(), { wrapper });
    await result.current.mutateAsync({ id: 1, payload: { client_id: null } });
    expect(mockInvoke).toHaveBeenCalledWith("update_project", {
      id: 1,
      payload: { client_id: null },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectKeys.all });
  });
});

describe("useSetProjectState (FB-14)", () => {
  it.each(["archived", "active"] as const)(
    "a %s mutation invalidates the projects list and the active runs",
    async (state) => {
      mockInvoke.mockResolvedValueOnce({ ...fakeProject, state });
      const { wrapper, qc } = makeWrapper();
      qc.setQueryData(projectKeys.list(), [fakeProject]);
      qc.setQueryData(storyKeys.active(), []);
      const { result } = renderHook(() => useSetProjectState(), { wrapper });
      await result.current.mutateAsync({ id: 1, state });
      expect(mockInvoke).toHaveBeenCalledWith("set_project_state", { id: 1, state });
      expect(qc.getQueryState(projectKeys.list())?.isInvalidated).toBe(true);
      expect(qc.getQueryState(storyKeys.active())?.isInvalidated).toBe(true);
    },
  );

  it("a refused archive leaves the cache untouched and toasts the backend message", async () => {
    const refusal = 'AL has an active sprint "Sprint 3"; complete it before archiving';
    mockInvoke.mockRejectedValueOnce(refusal);
    const { wrapper, qc } = makeWrapper();
    const cached = [{ ...fakeProject, state: "active" }];
    qc.setQueryData(projectKeys.list(), cached);
    qc.setQueryData(storyKeys.active(), []);
    const { result } = renderHook(() => useSetProjectState(), { wrapper });
    await expect(result.current.mutateAsync({ id: 1, state: "archived" })).rejects.toBe(refusal);
    expect(qc.getQueryData(projectKeys.list())).toBe(cached);
    expect(qc.getQueryState(projectKeys.list())?.isInvalidated).toBe(false);
    expect(qc.getQueryState(storyKeys.active())?.isInvalidated).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(refusal));
  });
});
