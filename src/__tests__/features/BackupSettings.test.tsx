import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { open as openFolderPicker } from "@tauri-apps/plugin-dialog";
import Settings from "@/pages/Settings";
import { formatBackupTime } from "@/features/backup/BackupSettings";
import { useUiStore } from "@/stores/uiStore";
import type { BackupStatus } from "@/types";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(openFolderPicker);

const baseStatus: BackupStatus = {
  backup_dir: "D:\\Backups\\FlowBoard",
  last_backup_at: null,
  last_error: null,
  enabled: true,
};

function setupStatus(status: BackupStatus) {
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "get_backup_status") return Promise.resolve(status);
    return Promise.resolve(null);
  });
}

async function openBackupTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <Settings />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Backup" }));
  return screen.findByRole("button", { name: /choose folder/i });
}

function setBackupDirCalls() {
  return mockInvoke.mock.calls.filter(([cmd]) => cmd === "set_backup_dir");
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
  useUiStore.setState({ activeProjectId: null });
});

describe("BackupSettings — folder picker", () => {
  it("calls set_backup_dir with the picked folder", async () => {
    setupStatus(baseStatus);
    mockOpen.mockResolvedValue("E:\\NewBackups");
    const button = await openBackupTab();

    await userEvent.click(button);

    expect(mockOpen).toHaveBeenCalledWith(
      expect.objectContaining({ directory: true }),
    );
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_backup_dir", {
        path: "E:\\NewBackups",
      }),
    );
  });

  it("calls nothing when the picker is cancelled", async () => {
    setupStatus(baseStatus);
    mockOpen.mockResolvedValue(null);
    const button = await openBackupTab();

    await userEvent.click(button);

    await waitFor(() => expect(mockOpen).toHaveBeenCalledTimes(1));
    expect(setBackupDirCalls()).toHaveLength(0);
  });

  it("shows the current folder", async () => {
    setupStatus(baseStatus);
    await openBackupTab();
    expect(screen.getByText("D:\\Backups\\FlowBoard")).toBeInTheDocument();
  });
});

describe("BackupSettings — last backup", () => {
  it("shows Never when there has been no backup", async () => {
    setupStatus(baseStatus);
    await openBackupTab();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("shows the formatted time of the last backup", async () => {
    const at = "2026-10-27T14:30:00.000Z";
    setupStatus({ ...baseStatus, last_backup_at: at });
    await openBackupTab();

    const expected = formatBackupTime(at);
    expect(expected).toMatch(/2026/);
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText("Never")).not.toBeInTheDocument();
  });

  it("shows the last error", async () => {
    setupStatus({ ...baseStatus, last_error: "Disk full" });
    await openBackupTab();
    expect(screen.getByRole("alert")).toHaveTextContent("Disk full");
  });
});

describe("BackupSettings — staging build", () => {
  it("says backups are off and keeps the picker usable", async () => {
    setupStatus({ ...baseStatus, enabled: false });
    mockOpen.mockResolvedValue("E:\\Staging");
    const button = await openBackupTab();

    expect(screen.getByText(/backups are off in this build/i)).toBeInTheDocument();
    expect(button).toBeEnabled();

    await userEvent.click(button);
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_backup_dir", {
        path: "E:\\Staging",
      }),
    );
  });

  it("does not say backups are off when they are on", async () => {
    setupStatus(baseStatus);
    await openBackupTab();
    expect(screen.queryByText(/backups are off in this build/i)).not.toBeInTheDocument();
  });
});
