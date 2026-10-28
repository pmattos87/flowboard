import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import React from "react";
import { useBackupStatus, useSetBackupDir } from "@/hooks/useBackup";
import { useDbChangeSync } from "@/hooks/useDbChangeSync";
import type { BackupStatus } from "@/types";

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

// staleTime matches the app's queryClient, so a refetch below can only come
// from an invalidation, not from the data going stale on its own.
function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const noBackup: BackupStatus = {
  backup_dir: null,
  last_backup_at: null,
  last_error: null,
  enabled: true,
};
const backedUp: BackupStatus = {
  backup_dir: "D:\\Backups",
  last_backup_at: "2026-10-28T12:00:00.000Z",
  last_error: null,
  enabled: true,
};

function statusCalls() {
  return mockInvoke.mock.calls.filter(([cmd]) => cmd === "get_backup_status").length;
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockListen.mockReset();
  mockListen.mockResolvedValue(vi.fn());
});

describe("useBackupStatus", () => {
  it("fetches the status with get_backup_status", async () => {
    mockInvoke.mockResolvedValueOnce(noBackup);
    const { result } = renderHook(() => useBackupStatus(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(noBackup);
    expect(mockInvoke).toHaveBeenCalledWith("get_backup_status");
  });

  it("exposes a failed fetch as an error", async () => {
    mockInvoke.mockRejectedValueOnce("settings unreadable");
    const { result } = renderHook(() => useBackupStatus(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe("settings unreadable");
  });
});

describe("useSetBackupDir", () => {
  it("calls set_backup_dir with the path, then refetches the status", async () => {
    const backend: { status: BackupStatus } = { status: noBackup };
    mockInvoke.mockImplementation(async (cmd, args) => {
      if (cmd === "get_backup_status") return backend.status;
      if (cmd === "set_backup_dir") {
        const { path } = args as { path: string };
        backend.status = { ...backedUp, backup_dir: path };
        return undefined;
      }
      throw new Error(`unexpected command ${cmd}`);
    });

    const { result } = renderHook(
      () => ({ status: useBackupStatus(), setDir: useSetBackupDir() }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.status.data).toEqual(noBackup));
    expect(statusCalls()).toBe(1);

    await act(() => result.current.setDir.mutateAsync("D:\\Backups"));

    expect(mockInvoke).toHaveBeenCalledWith("set_backup_dir", { path: "D:\\Backups" });
    await waitFor(() => expect(result.current.status.data).toEqual(backedUp));
    expect(statusCalls()).toBe(2);
    const setIndex = mockInvoke.mock.calls.findIndex(([cmd]) => cmd === "set_backup_dir");
    const lastStatusIndex = mockInvoke.mock.calls.map(([cmd]) => cmd).lastIndexOf("get_backup_status");
    expect(lastStatusIndex).toBeGreaterThan(setIndex);
  });

  it("does not refetch the status when set_backup_dir rejects", async () => {
    mockInvoke.mockImplementation(async (cmd) => {
      if (cmd === "get_backup_status") return noBackup;
      if (cmd === "set_backup_dir") throw "backup folder D:\\Nope was not found";
      throw new Error(`unexpected command ${cmd}`);
    });

    const { result } = renderHook(
      () => ({ status: useBackupStatus(), setDir: useSetBackupDir() }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.status.isSuccess).toBe(true));

    act(() => result.current.setDir.mutate("D:\\Nope"));

    await waitFor(() => expect(result.current.setDir.isError).toBe(true));
    expect(result.current.setDir.error).toBe("backup folder D:\\Nope was not found");
    expect(statusCalls()).toBe(1);
  });
});

describe("backup status and db-changed", () => {
  it("refetches the backup status when a db-changed event arrives", async () => {
    const backend: { status: BackupStatus } = { status: noBackup };
    mockInvoke.mockImplementation(async (cmd) => {
      if (cmd === "get_backup_status") return backend.status;
      throw new Error(`unexpected command ${cmd}`);
    });

    const { result } = renderHook(
      () => {
        useDbChangeSync();
        return useBackupStatus();
      },
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.data).toEqual(noBackup));
    await waitFor(() => expect(mockListen).toHaveBeenCalledTimes(1));
    expect(mockListen.mock.calls[0][0]).toBe("db-changed");

    backend.status = backedUp;
    const handler = mockListen.mock.calls[0][1] as (e: unknown) => void;
    act(() => handler({ payload: null }));

    await waitFor(() => expect(result.current.data).toEqual(backedUp));
    expect(statusCalls()).toBe(2);
  });
});
