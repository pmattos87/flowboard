import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import React from "react";
import { useProjectLabels } from "@/hooks/useProjectLabels";
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

const task = (id: number, project_id: number, labels: string) => ({ id, project_id, labels });

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("useProjectLabels", () => {
  it("returns the distinct labels of only the given project's tasks, sorted", async () => {
    mockInvoke.mockResolvedValueOnce([
      task(1, 10, "qa,tooling"),
      task(2, 10, "tooling,ux"),
      task(3, 10, ""),
      task(4, 10, "Decisão,QA"),
      task(5, 20, "other-project"),
    ]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProjectLabels(10), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("list_tasks", { filters: { project_id: 10 } });
    expect(result.current.data).toEqual(["Decisão", "QA", "qa", "tooling", "ux"]);
  });

  it("does not fetch when the project id is null", () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProjectLabels(null), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("shares the project's task list cache, so invalidating taskKeys.all refetches", async () => {
    mockInvoke.mockResolvedValueOnce([task(1, 10, "qa")]);
    const { wrapper, qc } = makeWrapper();
    const { result } = renderHook(() => useProjectLabels(10), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(["qa"]));
    expect(qc.getQueryData(taskKeys.list({ project_id: 10 }))).toBeDefined();

    mockInvoke.mockResolvedValueOnce([task(1, 10, "qa,ux")]);
    await qc.invalidateQueries({ queryKey: taskKeys.all });
    await waitFor(() => expect(result.current.data).toEqual(["qa", "ux"]));
  });

  it("exposes the error state when the command fails", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("boom"));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProjectLabels(10), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
