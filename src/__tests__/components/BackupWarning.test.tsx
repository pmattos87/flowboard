import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { BackupWarning } from "@/components/BackupWarning";
import { backupKeys } from "@/hooks/useBackup";
import type { BackupStatus } from "@/types";

const mockInvoke = vi.mocked(invoke);

const NOW = new Date("2026-10-28T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();

const baseStatus: BackupStatus = {
  backup_dir: "G:\\My Drive\\FlowBoard",
  last_backup_at: null,
  last_error: null,
  enabled: true,
};

function SettingsProbe() {
  const location = useLocation();
  return <p data-testid="settings-location">{location.pathname + location.search}</p>;
}

function renderWarning(status: BackupStatus) {
  mockInvoke.mockResolvedValue(status);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={["/board/discovery"]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/settings" element={<SettingsProbe />} />
          <Route path="*" element={<BackupWarning />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
  return qc;
}

beforeEach(() => {
  mockInvoke.mockReset();
  // Only Date is faked, so React Query and waitFor keep real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BackupWarning", () => {
  it("shows 'No backup' with no age when there has never been a backup", async () => {
    renderWarning(baseStatus);
    const card = await screen.findByTestId("backup-warning");
    expect(within(card).getByText("No backup")).toBeInTheDocument();
    expect(within(card).queryByText(/days ago/)).not.toBeInTheDocument();
  });

  it("shows '<n> days ago' when the last backup is more than 3 days old", async () => {
    renderWarning({ ...baseStatus, last_backup_at: daysAgo(5) });
    const card = await screen.findByTestId("backup-warning");
    expect(within(card).getByText("No backup")).toBeInTheDocument();
    expect(within(card).getByText("5 days ago")).toBeInTheDocument();
  });

  it("shows the card just past the 3-day boundary", async () => {
    renderWarning({
      ...baseStatus,
      last_backup_at: new Date(NOW.getTime() - 3 * DAY_MS - 1000).toISOString(),
    });
    const card = await screen.findByTestId("backup-warning");
    expect(within(card).getByText("3 days ago")).toBeInTheDocument();
  });

  it.each([
    ["exactly 3 days", 3],
    ["1 day", 1],
    ["0 days", 0],
  ])("shows no card when the last backup is %s old", async (_label, days) => {
    const qc = renderWarning({ ...baseStatus, last_backup_at: daysAgo(days) });
    // Assert absence only once the status has loaded.
    await waitFor(() =>
      expect(qc.getQueryState(backupKeys.status())?.status).toBe("success")
    );
    expect(screen.queryByTestId("backup-warning")).not.toBeInTheDocument();
  });

  it("shows no card while the status is still loading", () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BackupWarning />
        </QueryClientProvider>
      </MemoryRouter>
    );
    expect(screen.queryByTestId("backup-warning")).not.toBeInTheDocument();
  });

  it("hints to set the folder when none is set", async () => {
    renderWarning({ ...baseStatus, backup_dir: null });
    const card = await screen.findByTestId("backup-warning");
    expect(within(card).getByText("Set the folder in Settings › Backup")).toBeInTheDocument();
    expect(within(card).queryByText(/Google Drive/)).not.toBeInTheDocument();
  });

  it("hints to check Google Drive when a folder is set", async () => {
    renderWarning(baseStatus);
    const card = await screen.findByTestId("backup-warning");
    expect(
      within(card).getByText("Check that the Google Drive folder exists and Drive is connected")
    ).toBeInTheDocument();
    expect(within(card).queryByText(/Set the folder/)).not.toBeInTheDocument();
  });

  it("has no dismiss control and opens the Settings Backup tab when clicked", async () => {
    const user = userEvent.setup();
    renderWarning(baseStatus);
    const card = await screen.findByRole("link", { name: /no backup/i });
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    await user.click(card);
    expect(await screen.findByTestId("settings-location")).toHaveTextContent(
      "/settings?tab=backup"
    );
  });

  it("is shown in staging (backups off) with no backup", async () => {
    renderWarning({ ...baseStatus, enabled: false, backup_dir: null });
    const card = await screen.findByTestId("backup-warning");
    expect(within(card).getByText("No backup")).toBeInTheDocument();
  });

  it("is always shown in staging, even with a recent backup", async () => {
    renderWarning({ ...baseStatus, enabled: false, last_backup_at: daysAgo(1) });
    expect(await screen.findByTestId("backup-warning")).toBeInTheDocument();
  });
});
