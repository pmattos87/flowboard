import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import React from "react";
import {
  useAttachments,
  useCreateAttachment,
  useDeleteAttachment,
  attachmentKeys,
} from "@/hooks/useAttachments";

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

const fakeAttachment = {
  id: 1,
  task_id: 10,
  filename: "design.png",
  filepath: "/home/user/design.png",
  size: 204800,
  uploaded_at: "2024-01-01T00:00:00.000Z",
};

describe("useAttachments", () => {
  it("does not fetch when taskId is null", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAttachments(null), { wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches attachments for a given taskId", async () => {
    mockInvoke.mockResolvedValueOnce([fakeAttachment]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAttachments(10), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("list_attachments", { taskId: 10 });
    expect(result.current.data).toEqual([fakeAttachment]);
  });
});

describe("useCreateAttachment", () => {
  it("calls create_attachment and invalidates the task attachment list", async () => {
    mockInvoke.mockResolvedValueOnce(fakeAttachment);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateAttachment(), { wrapper });
    await result.current.mutateAsync({
      task_id: 10,
      filename: "design.png",
      filepath: "/home/user/design.png",
      size: 204800,
    });
    expect(mockInvoke).toHaveBeenCalledWith("create_attachment", {
      payload: { task_id: 10, filename: "design.png", filepath: "/home/user/design.png", size: 204800 },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: attachmentKeys.list(10) });
  });
});

describe("useDeleteAttachment", () => {
  it("calls delete_attachment and invalidates the task attachment list", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteAttachment(10), { wrapper });
    await result.current.mutateAsync(1);
    expect(mockInvoke).toHaveBeenCalledWith("delete_attachment", { id: 1 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: attachmentKeys.list(10) });
  });
});
