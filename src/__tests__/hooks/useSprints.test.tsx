import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import React from "react";
import { useSprints, useSprint, useCompleteSprint, sprintKeys } from "@/hooks/useSprints";
import { taskKeys } from "@/hooks/useTasks";

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

const fakeSprint = {
  id: 1,
  project_id: 10,
  name: "Sprint 1",
  goal: "",
  start_date: "2024-01-01",
  end_date: "2024-01-14",
  status: "backlog",
};

describe("useSprints", () => {
  it("fetches all sprints when no projectId provided", async () => {
    mockInvoke.mockResolvedValueOnce([fakeSprint]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSprints(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("list_sprints", { projectId: null });
    expect(result.current.data).toEqual([fakeSprint]);
  });

  it("fetches sprints filtered by projectId", async () => {
    mockInvoke.mockResolvedValueOnce([fakeSprint]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSprints(10), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("list_sprints", { projectId: 10 });
  });

  it("uses different query keys for different projectIds", () => {
    expect(sprintKeys.list(1)).not.toEqual(sprintKeys.list(2));
    expect(sprintKeys.list(undefined)).toEqual(sprintKeys.list(undefined));
  });
});

describe("useSprint", () => {
  it("does not fetch when id is null", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSprint(null), { wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches when id is provided", async () => {
    mockInvoke.mockResolvedValueOnce(fakeSprint);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSprint(1), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("get_sprint", { id: 1 });
  });
});

describe("useCompleteSprint", () => {
  it("calls complete_sprint and invalidates sprints and tasks", async () => {
    mockInvoke.mockResolvedValueOnce({ ...fakeSprint, status: "completed" });
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCompleteSprint(), { wrapper });
    await result.current.mutateAsync({ sprintId: 1, target: { kind: "backlog" } });
    expect(mockInvoke).toHaveBeenCalledWith("complete_sprint", {
      sprintId: 1,
      target: { kind: "backlog" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sprintKeys.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: taskKeys.all });
  });

  it("hands the backend refusal text to the caller and invalidates nothing", async () => {
    const refusal = "a Story enters or leaves a sprint only at ready; FB-4 is building";
    mockInvoke.mockRejectedValueOnce(refusal);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCompleteSprint(), { wrapper });
    await expect(
      result.current.mutateAsync({ sprintId: 1, target: { kind: "backlog" } }),
    ).rejects.toBe(refusal);
    await waitFor(() => expect(result.current.error).toBe(refusal));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
