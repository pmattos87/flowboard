import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import React from "react";
import { useDbChangeSync } from "@/hooks/useDbChangeSync";

const mockListen = vi.mocked(listen);

function makeWrapper() {
  const qc = new QueryClient();
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
    invalidate,
  };
}

beforeEach(() => {
  mockListen.mockReset();
});

describe("useDbChangeSync", () => {
  it("invalidates all queries once per db-changed event", async () => {
    const unlisten = vi.fn();
    mockListen.mockResolvedValue(unlisten);
    const { wrapper, invalidate } = makeWrapper();
    renderHook(() => useDbChangeSync(), { wrapper });
    await waitFor(() => expect(mockListen).toHaveBeenCalledTimes(1));
    expect(mockListen.mock.calls[0][0]).toBe("db-changed");

    const handler = mockListen.mock.calls[0][1] as (e: unknown) => void;
    handler({ payload: null });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith();
  });

  it("unlistens on unmount", async () => {
    const unlisten = vi.fn();
    mockListen.mockResolvedValue(unlisten);
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useDbChangeSync(), { wrapper });
    await waitFor(() => expect(mockListen).toHaveBeenCalled());
    await Promise.resolve();
    unmount();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("unlistens when unmounted before listen resolves", async () => {
    const unlisten = vi.fn();
    let resolve!: (fn: () => void) => void;
    mockListen.mockReturnValue(new Promise((r) => (resolve = r)));
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useDbChangeSync(), { wrapper });
    unmount();
    expect(unlisten).not.toHaveBeenCalled();
    resolve(unlisten);
    await waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });
});
