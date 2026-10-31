import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { DiscoveryBoard } from "@/features/boards/DiscoveryBoard";
import { UserStoryBoard } from "@/features/boards/UserStoryBoard";
import { useUiStore } from "@/stores/uiStore";
import type { Project, Task, TaskStatus, TaskType } from "@/types";

// FB-238: both boards show the same amber strip listing the active project's
// invisible Stories and epics; a key opens the row's detail panel.

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }));

const mockInvoke = vi.mocked(invoke);

function row(
  id: number, title: string, type: TaskType, status: TaskStatus, sprint_id: number | null,
  parent_id: number | null = null,
): Task {
  return {
    id, project_id: 1, task_number: id + 100, sprint_id, parent_id, title,
    description: "", type, status, priority: "medium",
    assignee_id: null, story_points: 0, due_date: null, created_at: "", updated_at: "",
    labels: "", feature_branch: null, review_verdict: null, reviewed_commit: null,
    findings_url: null, run_stopped: false, risk: false, release_id: null, epic_id: null,
  };
}

function project(ladder: Project["ladder"]): Project {
  return {
    id: 1, name: "Homelab", key: "HL", description: "", color: "#6366f1", created_at: "",
    logo_data: null, position: 0, ladder, kind: "internal",
  };
}

const sprints = [
  { id: 7, project_id: 1, name: "Sprint 7", goal: "", status: "backlog", start_date: "2024-01-01", end_date: "2024-01-14" },
  { id: 8, project_id: 1, name: "Sprint 8", goal: "", status: "backlog", start_date: "2024-01-15", end_date: "2024-01-28" },
];

// Legacy: three visible rows (one per board, plus a bug that is never reported)
// and three invisible ones.
const VISIBLE_DISCOVERY = row(1, "Visible discovery story", "story", "refining", null);
const VISIBLE_STORY = row(2, "Visible sprint story", "story", "in_progress", 7);
const LEGACY_TASKS: Task[] = [
  VISIBLE_DISCOVERY,
  VISIBLE_STORY,
  row(3, "Stuck in review", "story", "in_review", null),
  row(4, "Ready but scheduled", "story", "ready_for_development", 8),
  row(5, "Scheduled epic", "epic", "done", 7),
  row(6, "Bug off every board", "bug", "in_review", null),
  row(7, "Subtask off every board", "subtask", "in_review", null, 2),
];
const LEGACY_INVISIBLE_KEYS = ["HL-103", "HL-104", "HL-105"];

function mockData(tasks: Task[], ladder: Project["ladder"] = "legacy") {
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "get_project") return Promise.resolve(project(ladder));
    if (cmd === "list_projects") return Promise.resolve([project(ladder)]);
    if (cmd === "list_tasks") return Promise.resolve(tasks);
    if (cmd === "list_sprints") return Promise.resolve(sprints);
    return Promise.resolve([]);
  });
}

function renderBoard(board: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{board}</MemoryRouter>
    </QueryClientProvider>,
  );
}

async function findStrip() {
  return screen.findByRole("group", { name: "Issues on no board" });
}

function chipKeys(strip: HTMLElement): string[] {
  return within(strip).getAllByRole("button").map((b) => b.textContent ?? "");
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({
    activeProjectId: 1, selectedTaskId: null, boardSprintFilter: "all", boardSprintFilterFor: 1,
    discoveryGrouping: "none",
  });
});

const BOARDS = [
  { name: "DiscoveryBoard", board: <DiscoveryBoard />, marker: VISIBLE_DISCOVERY.title },
  { name: "UserStoryBoard", board: <UserStoryBoard />, marker: VISIBLE_STORY.title },
];

describe("InvisibleStoriesStrip on the boards", () => {
  for (const { name, board, marker } of BOARDS) {
    it(`${name} lists exactly the invisible rows, with their keys`, async () => {
      mockData(LEGACY_TASKS);
      renderBoard(board);
      const strip = await findStrip();
      expect(strip).toHaveTextContent("3 issues appear on no board:");
      expect(chipKeys(strip)).toEqual(LEGACY_INVISIBLE_KEYS);
      // The board itself still renders its own rows.
      expect(screen.getByText(marker)).toBeInTheDocument();
    });

    it(`${name}: clicking a key opens that row's detail panel`, async () => {
      mockData(LEGACY_TASKS);
      renderBoard(board);
      const strip = await findStrip();
      fireEvent.click(within(strip).getByRole("button", { name: "HL-104" }));
      expect(useUiStore.getState().selectedTaskId).toBe(4);
    });

    it(`${name} renders no strip when nothing is invisible`, async () => {
      mockData([VISIBLE_DISCOVERY, VISIBLE_STORY]);
      renderBoard(board);
      await screen.findByText(marker);
      expect(screen.queryByTestId("invisible-stories-strip")).not.toBeInTheDocument();
      expect(screen.queryByText(/appear on no board/)).not.toBeInTheDocument();
    });
  }

  it("uses the singular for one invisible row", async () => {
    mockData([VISIBLE_DISCOVERY, row(3, "Stuck in review", "story", "in_review", null)]);
    renderBoard(<DiscoveryBoard />);
    expect(await findStrip()).toHaveTextContent("1 issue appears on no board:");
  });

  it("UserStoryBoard shows the strip above its empty state", async () => {
    mockData([VISIBLE_DISCOVERY, row(3, "Stuck in review", "story", "in_review", null)]);
    renderBoard(<UserStoryBoard />);
    const strip = await findStrip();
    expect(chipKeys(strip)).toEqual(["HL-103"]);
    const empty = screen.getByText(/No stories in/);
    // The strip comes before the empty state in the document.
    expect(strip.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("UserStoryBoard keeps listing rows its sprint filter hides", async () => {
    useUiStore.setState({ boardSprintFilter: 7 });
    mockData(LEGACY_TASKS);
    renderBoard(<UserStoryBoard />);
    const strip = await findStrip();
    // HL-104 sits in Sprint 8, which the filter hides.
    expect(chipKeys(strip)).toEqual(LEGACY_INVISIBLE_KEYS);
    expect(screen.getByText(VISIBLE_STORY.title)).toBeInTheDocument();
  });

  it("DiscoveryBoard shows the strip above the grouped view on a Factory project", async () => {
    useUiStore.setState({ discoveryGrouping: "epic" });
    mockData(
      [
        row(1, "Factory backlog story", "story", "backlog", null),
        row(2, "Building with no sprint", "story", "building", null),
        row(3, "Tested bug Story with no sprint", "bug", "tested", null),
        row(4, "Factory epic", "epic", "done", 7),
      ],
      "factory",
    );
    renderBoard(<DiscoveryBoard />);
    const strip = await findStrip();
    expect(strip).toHaveTextContent("2 issues appear on no board:");
    expect(chipKeys(strip)).toEqual(["HL-102", "HL-103"]);
    expect(screen.getByRole("button", { name: /group by epic/i })).toHaveAttribute("aria-pressed", "true");
  });
});
