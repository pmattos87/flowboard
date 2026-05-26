import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import React from "react";
import {
  useTimeLogs,
  useCreateTimeLog,
  useDeleteTimeLog,
  timeLogKeys,
} from "@/hooks/useTimeLogs";

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

const fakeTimeLog = {
  id: 1,
  task_id: 10,
  person_id: 2,
  minutes: 90,
  logged_at: "2024-01-15",
  note: "Worked on tests",
};

describe("useTimeLogs", () => {
  it("does not fetch when taskId is null", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTimeLogs(null), { wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches time logs for a given taskId", async () => {
    mockInvoke.mockResolvedValueOnce([fakeTimeLog]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTimeLogs(10), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("list_time_logs", { taskId: 10 });
    expect(result.current.data).toEqual([fakeTimeLog]);
  });
});

describe("useCreateTimeLog", () => {
  it("calls create_time_log and invalidates the task time log list", async () => {
    mockInvoke.mockResolvedValueOnce(fakeTimeLog);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateTimeLog(), { wrapper });
    await result.current.mutateAsync({
      task_id: 10,
      person_id: 2,
      minutes: 90,
      logged_at: "2024-01-15",
      note: "Worked on tests",
    });
    expect(mockInvoke).toHaveBeenCalledWith("create_time_log", {
      payload: { task_id: 10, person_id: 2, minutes: 90, logged_at: "2024-01-15", note: "Worked on tests" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: timeLogKeys.list(10) });
  });
});

describe("useDeleteTimeLog", () => {
  it("calls delete_time_log and invalidates the task time log list", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteTimeLog(10), { wrapper });
    await result.current.mutateAsync(1);
    expect(mockInvoke).toHaveBeenCalledWith("delete_time_log", { id: 1 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: timeLogKeys.list(10) });
  });
});
