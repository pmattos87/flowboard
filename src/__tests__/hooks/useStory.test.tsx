import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import React from "react";
import { toast } from "sonner";
import { useRestartRun, useStory, useStoryTrail } from "@/hooks/useStory";
import { taskKeys } from "@/hooks/useTasks";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockInvoke = vi.mocked(invoke);
const mockToast = vi.mocked(toast);

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
  mockToast.success.mockReset();
  mockToast.error.mockReset();
});

describe("useStory", () => {
  it("reads the Story view by key", async () => {
    mockInvoke.mockResolvedValueOnce({ key: "FB-7", title: "T" });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStory("FB-7"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("get_story", { key: "FB-7" });
    expect(result.current.data?.key).toBe("FB-7");
  });

  it("does not run when disabled", () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useStory("FB-7", false), { wrapper });
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe("useStoryTrail", () => {
  it("reads the trail by key", async () => {
    mockInvoke.mockResolvedValueOnce([{ at: "", action: "created", old: "", new: "backlog", by: "Pedro" }]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStoryTrail("FB-7"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("get_story_trail", { key: "FB-7" });
    expect(result.current.data).toHaveLength(1);
  });
});

describe("useRestartRun", () => {
  it("restarts the Run and invalidates task queries", async () => {
    mockInvoke.mockResolvedValueOnce({ key: "FB-7" });
    const { wrapper, qc } = makeWrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useRestartRun(), { wrapper });
    result.current.mutate("FB-7");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("restart_run", { key: "FB-7" });
    expect(spy).toHaveBeenCalledWith({ queryKey: taskKeys.all });
    expect(mockToast.success).toHaveBeenCalled();
  });

  it("shows the refusal when the backend refuses", async () => {
    mockInvoke.mockRejectedValueOnce("FB-7's Run is not stopped");
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useRestartRun(), { wrapper });
    result.current.mutate("FB-7");
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining("not stopped"));
  });
});
