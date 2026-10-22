import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { ActiveRunsPage, timeInStage } from "@/features/story/ActiveRunsPage";
import type { ActiveRun } from "@/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const mockInvoke = vi.mocked(invoke);

const run = (over: Partial<ActiveRun>): ActiveRun => ({
  key: "FB-1", project: "Flowboard", title: "", status: "building", assignee: "Claude",
  needs_pedro: false, flags: { stopped: false, waiting_on_bugs: 0 },
  stage_entered_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  ...over,
});

// The backend already orders them: stopped first.
const runs = [
  run({ key: "HL-4", project: "Hammer Loc", title: "Stopped one", assignee: "Pedro", needs_pedro: true, flags: { stopped: true, waiting_on_bugs: 0 } }),
  run({ key: "FB-2", title: "Agent building", flags: { stopped: false, waiting_on_bugs: 2 } }),
  run({ key: "FB-3", title: "Pedro testing", status: "integrated_tests", assignee: "Pedro", needs_pedro: true }),
];

function renderPage() {
  mockInvoke.mockImplementation((cmd) => Promise.resolve(cmd === "list_active_runs" ? runs : []));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/runs"]}>
        <Routes>
          <Route path="/runs" element={<ActiveRunsPage />} />
          <Route path="/story/:key" element={<p>story page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("ActiveRunsPage", () => {
  it("lists Runs across projects in the backend's order with Stage, flag, whose move and time", async () => {
    renderPage();
    expect(await screen.findByText("Stopped one")).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent?.slice(0, 4))).toEqual(["HL-4", "FB-2", "FB-3"]);
    expect(screen.getByText("Hammer Loc")).toBeInTheDocument();
    expect(screen.getByText("Integrated Tests")).toBeInTheDocument();
    expect(screen.getByText("stopped")).toBeInTheDocument();
    expect(screen.getByText("waiting on 2 bugs")).toBeInTheDocument();
    expect(screen.getAllByText("3h")).toHaveLength(3);
  });

  it("Needs Pedro keeps only the Stories assigned to him", async () => {
    renderPage();
    await screen.findByText("Agent building");
    fireEvent.click(screen.getByRole("button", { name: "Needs Pedro" }));
    expect(screen.queryByText("Agent building")).not.toBeInTheDocument();
    expect(screen.getByText("Stopped one")).toBeInTheDocument();
    expect(screen.getByText("Pedro testing")).toBeInTheDocument();
  });

  it("opens the Story page from a row", async () => {
    renderPage();
    fireEvent.click(await screen.findByText("Agent building"));
    expect(await screen.findByText("story page")).toBeInTheDocument();
  });
});

describe("timeInStage", () => {
  it("rounds down to minutes, hours or days", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    expect(timeInStage("2026-10-22T11:48:00Z", now)).toBe("12m");
    expect(timeInStage("2026-10-22T07:00:00Z", now)).toBe("5h");
    expect(timeInStage("2026-10-18T12:00:00Z", now)).toBe("4d");
    expect(timeInStage("", now)).toBe("—");
  });
});
