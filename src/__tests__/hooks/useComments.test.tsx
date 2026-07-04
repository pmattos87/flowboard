import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import React from "react";
import { toast } from "sonner";
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  commentKeys,
} from "@/hooks/useComments";

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
});

const fakeComment = {
  id: 1,
  task_id: 10,
  author_id: 2,
  body: "Nice work!",
  created_at: "2024-01-01T00:00:00.000Z",
};

describe("useComments", () => {
  it("does not fetch when taskId is null", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useComments(null), { wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches comments for a given taskId", async () => {
    mockInvoke.mockResolvedValueOnce([fakeComment]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useComments(10), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("list_comments", { taskId: 10 });
    expect(result.current.data).toEqual([fakeComment]);
  });
});

describe("useCreateComment", () => {
  it("calls create_comment and invalidates the task comment list", async () => {
    mockInvoke.mockResolvedValueOnce(fakeComment);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateComment(), { wrapper });
    await result.current.mutateAsync({ task_id: 10, author_id: 2, body: "Nice work!" });
    expect(mockInvoke).toHaveBeenCalledWith("create_comment", {
      payload: { task_id: 10, author_id: 2, body: "Nice work!" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: commentKeys.list(10) });
  });

  it("shows an in-app success toast when a comment is added", async () => {
    mockInvoke.mockResolvedValueOnce(fakeComment);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateComment(), { wrapper });
    await result.current.mutateAsync({ task_id: 10, author_id: 2, body: "Nice work!" });
    expect(mockToast.success).toHaveBeenCalledWith("Comment added");
  });
});

describe("useDeleteComment", () => {
  it("calls delete_comment and invalidates the task comment list", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteComment(10), { wrapper });
    await result.current.mutateAsync(1);
    expect(mockInvoke).toHaveBeenCalledWith("delete_comment", { id: 1 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: commentKeys.list(10) });
  });
});
