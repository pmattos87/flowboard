import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { SprintPlanningBoard } from "@/features/boards/SprintPlanningBoard";
import { useUiStore } from "@/stores/uiStore";
import { MemoryRouter } from "react-router-dom";

const mockInvoke = vi.mocked(invoke);

const fakeSprints = [
  {
    id: 10, project_id: 1, name: "Sprint 1", goal: "", status: "completed",
    start_date: "2024-01-01", end_date: "2024-01-14",
  },
  {
    id: 11, project_id: 1, name: "Sprint 2", goal: "Ship the planning board", status: "active",
    start_date: "2024-01-15", end_date: "2024-01-28",
  },
];

const fakeTasks = [
  {
    id: 1, project_id: 1, sprint_id: null, parent_id: null,
    title: "Backlog item A", description: "", type: "story", status: "ready_for_development",
    priority: "medium", assignee_id: null, story_points: 2, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
  {
    id: 4, project_id: 1, sprint_id: null, parent_id: null,
    title: "Refining story D", description: "", type: "story", status: "refining",
    priority: "medium", assignee_id: null, story_points: 2, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
  {
    id: 2, project_id: 1, sprint_id: 11, parent_id: null,
    title: "Sprint item B", description: "", type: "story", status: "in_progress",
    priority: "high", assignee_id: null, story_points: 3, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
  {
    id: 3, project_id: 1, sprint_id: null, parent_id: null,
    title: "Backlog bug C", description: "", type: "bug", status: "todo",
    priority: "low", assignee_id: null, story_points: 1, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
];

const fakeProject = {
  id: 1, name: "Alpha", key: "FB", description: "", color: "#6366f1",
  created_at: "2024-01-01T00:00:00.000Z",
};

function renderBoard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SprintPlanningBoard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({
    activeProjectId: null,
    selectedTaskId: null,
    selectedSprintId: null,
    boardSprintFilter: "all",
    boardSprintFilterFor: null,
  });
});

describe("SprintPlanningBoard — no project", () => {
  it("shows select project prompt", () => {
    renderBoard();
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });
});

describe("SprintPlanningBoard — with sprints and tasks", () => {
  beforeEach(() => {
    // Pin the filter to "all" so every sprint + backlog section renders.
    useUiStore.setState({ activeProjectId: 1, boardSprintFilter: "all", boardSprintFilterFor: 1 });
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_sprints") return Promise.resolve(fakeSprints);
      if (cmd === "list_tasks") return Promise.resolve(fakeTasks);
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "get_project") return Promise.resolve(fakeProject);
      return Promise.resolve(null);
    });
  });

  it("renders the board heading", async () => {
    renderBoard();
    await waitFor(() =>
      expect(screen.getByText("Sprint Planning Board")).toBeInTheDocument()
    );
  });

  it("shows a story assigned to a sprint", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Sprint item B")).toBeInTheDocument());
  });

  it("shows a ready-for-development backlog story (no sprint)", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Backlog item A")).toBeInTheDocument());
  });

  it("hides backlog stories that are not ready for development (FB-85)", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Backlog item A")).toBeInTheDocument());
    expect(screen.queryByText("Refining story D")).not.toBeInTheDocument();
  });

  it("excludes non-story tasks from the board", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Backlog item A")).toBeInTheDocument());
    expect(screen.queryByText("Backlog bug C")).not.toBeInTheDocument();
  });

  it("shows the sprint goal in the sprint header", async () => {
    renderBoard();
    await waitFor(() =>
      expect(screen.getByText("Ship the planning board")).toBeInTheDocument()
    );
  });

  it("renders a Create sprint button", async () => {
    renderBoard();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /create sprint/i })).toBeInTheDocument()
    );
  });

  it("collapses completed sprints by default and leaves others expanded", async () => {
    renderBoard();
    // Completed sprint (Sprint 1) starts collapsed — its toggle offers "Expand".
    const completedHeader = await waitFor(() =>
      screen.getByText("Completed").closest("div")!
    );
    expect(within(completedHeader).getByLabelText("Expand section")).toBeInTheDocument();
    // Active sprint stays expanded — its toggle offers "Collapse".
    const activeHeader = screen.getByText("Active").closest("div")!;
    expect(within(activeHeader).getByLabelText("Collapse section")).toBeInTheDocument();
  });

  it("renders the sprint filter with all options", async () => {
    renderBoard();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /sprint 1/i })).toBeInTheDocument()
    );
    expect(screen.getByRole("option", { name: /all sprints/i })).toBeInTheDocument();
    // FB-91: the unscheduled option is named for the gate, not "Backlog".
    expect(
      screen.getByRole("option", { name: /ready for development \(no sprint\)/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /sprint 2/i })).toBeInTheDocument();
  });

  it("names the unscheduled row 'Ready for Development' (FB-91)", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Backlog item A")).toBeInTheDocument());
    // The row header is a <span>; the filter <option> shares the wording.
    const headers = screen.getAllByText("Ready for Development");
    expect(headers.some((el) => el.tagName === "SPAN")).toBe(true);
  });
});

describe("SprintPlanningBoard — sprint status badge (FB-91 guard)", () => {
  it("still labels a not-yet-started sprint 'Backlog'", async () => {
    // STATUS_LABELS.backlog is the sprint's own status badge — a different
    // concept from the unscheduled row, and easy to clobber with a file-wide
    // find/replace when renaming that row.
    useUiStore.setState({ activeProjectId: 1, boardSprintFilter: "all", boardSprintFilterFor: 1 });
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_sprints")
        return Promise.resolve([
          {
            id: 12, project_id: 1, name: "Sprint 3", goal: "", status: "backlog",
            start_date: "2024-02-01", end_date: "2024-02-14",
          },
        ]);
      if (cmd === "list_tasks") return Promise.resolve(fakeTasks);
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "get_project") return Promise.resolve(fakeProject);
      return Promise.resolve(null);
    });
    renderBoard();
    // "Backlog" now appears nowhere else on this board: the unscheduled row is
    // "Ready for Development" and so is its filter option.
    await waitFor(() => expect(screen.getByText("Backlog")).toBeInTheDocument());
  });
});

describe("SprintPlanningBoard — default filter", () => {
  it("defaults the filter to the active sprint", async () => {
    useUiStore.setState({ activeProjectId: 1, boardSprintFilter: "all", boardSprintFilterFor: null });
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_sprints") return Promise.resolve(fakeSprints);
      if (cmd === "list_tasks") return Promise.resolve(fakeTasks);
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "get_project") return Promise.resolve(fakeProject);
      return Promise.resolve(null);
    });
    renderBoard();
    await waitFor(() => {
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe("11");
    });
  });
});

describe("SprintPlanningBoard — sprint completion (FB-119)", () => {
  const sprint = (id: number, status: string) => ({
    id, project_id: 1, name: `Sprint ${id}`, goal: "", status,
    start_date: "2024-03-01", end_date: "2024-03-14",
  });
  const story = (id: number, sprintId: number | null, status: string, points: number, type = "story") => ({
    id, project_id: 1, sprint_id: sprintId, parent_id: null,
    title: `Story ${id}`, description: "", type, status,
    priority: "medium", assignee_id: null, story_points: points, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  });

  function setup(sprints: unknown[], tasks: unknown[], ladder: "legacy" | "factory" = "legacy") {
    useUiStore.setState({ activeProjectId: 1, boardSprintFilter: "all", boardSprintFilterFor: 1 });
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_sprints") return Promise.resolve(sprints);
      if (cmd === "list_tasks") return Promise.resolve(tasks);
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "get_project") return Promise.resolve({ ...fakeProject, ladder });
      return Promise.resolve(null);
    });
    renderBoard();
  }

  it("shows 0 / 0 pts · 0% and an empty bar for an empty sprint", async () => {
    setup([sprint(20, "active")], []);
    const text = await screen.findByText("0 / 0 pts · 0%");
    expect(text).toBeInTheDocument();
    expect(screen.getByTestId("sprint-progress-bar")).toHaveStyle({ width: "0%" });
  });

  it("shows 75% for 3 of 4 points done", async () => {
    setup([sprint(20, "active")], [story(1, 20, "done", 3), story(2, 20, "todo", 1)]);
    expect(await screen.findByText("3 / 4 pts · 75%")).toBeInTheDocument();
    expect(screen.getByTestId("sprint-progress-bar")).toHaveStyle({ width: "75%" });
  });

  it("does not count bugs", async () => {
    setup([sprint(20, "active")], [story(1, 20, "done", 2), story(2, 20, "todo", 5, "bug")]);
    expect(await screen.findByText("2 / 2 pts · 100%")).toBeInTheDocument();
  });

  it("leaves canceled points out of the total and lists them in the tooltip", async () => {
    setup([sprint(20, "active")], [story(1, 20, "done", 2), story(2, 20, "canceled", 2)]);
    const text = await screen.findByText("2 / 2 pts · 100%");
    expect(text).toHaveAttribute("title", expect.stringContaining("2 canceled (not counted)"));
    expect(text.getAttribute("title")).toContain("2 done");
  });

  it("labels tooltip entries by the factory ladder statuses", async () => {
    setup(
      [sprint(20, "active")],
      [story(1, 20, "building", 3), story(2, 20, "integrated_tests", 2), story(3, 20, "done", 1)],
      "factory",
    );
    const text = await screen.findByText("1 / 6 pts · 17%");
    const title = text.getAttribute("title") ?? "";
    expect(title).toContain("3 building");
    expect(title).toContain("2 integrated tests");
    expect(title).toContain("1 done");
  });

  it("colours the bar blue for an active sprint under 100%", async () => {
    setup([sprint(20, "active")], [story(1, 20, "done", 1), story(2, 20, "todo", 1)]);
    await screen.findByText("1 / 2 pts · 50%");
    expect(screen.getByTestId("sprint-progress-bar").className).toMatch(/bg-blue-/);
  });

  it("colours the bar gray for backlog and completed sprints under 100%", async () => {
    setup(
      [sprint(20, "backlog"), sprint(21, "completed")],
      [story(1, 20, "todo", 2), story(2, 21, "done", 1), story(3, 21, "todo", 1)],
    );
    await screen.findByText("0 / 2 pts · 0%");
    const bars = screen.getAllByTestId("sprint-progress-bar");
    expect(bars).toHaveLength(2);
    for (const bar of bars) expect(bar.className).toMatch(/bg-gray-/);
  });

  it("colours the bar emerald at 100%, even for a completed sprint", async () => {
    setup([sprint(21, "completed")], [story(1, 21, "done", 2), story(2, 21, "canceled", 1)]);
    await screen.findByText("2 / 2 pts · 100%");
    expect(screen.getByTestId("sprint-progress-bar").className).toMatch(/bg-emerald-/);
  });

  it("shows no progress on the Ready for Development row", async () => {
    setup([], [story(1, null, "ready_for_development", 3)]);
    await screen.findByText("Story 1");
    expect(screen.queryByText(/pts · \d+%/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("sprint-progress-bar")).not.toBeInTheDocument();
  });

  it("shows progress on the sprint row but none on the Ready for Development row beside it", async () => {
    setup([sprint(20, "active")], [story(1, null, "ready_for_development", 3), story(2, 20, "done", 2)]);
    await screen.findByText("2 / 2 pts · 100%");
    const readyRow = screen.getByText("Ready for Development").closest("div.rounded-lg") as HTMLElement;
    const sprintRow = screen.getByText("Sprint 20").closest("div.rounded-lg") as HTMLElement;
    expect(within(readyRow).queryByText(/pts · \d+%/)).not.toBeInTheDocument();
    expect(within(readyRow).queryByTestId("sprint-progress-bar")).not.toBeInTheDocument();
    expect(within(sprintRow).getByTestId("sprint-progress-bar")).toBeInTheDocument();
    expect(screen.getAllByTestId("sprint-progress-bar")).toHaveLength(1);
  });

  it("colours the bar emerald at 100% for active and backlog sprints too", async () => {
    setup(
      [sprint(20, "active"), sprint(21, "backlog")],
      [story(1, 20, "done", 3), story(2, 21, "done", 1), story(3, 21, "canceled", 4)],
    );
    await screen.findByText("3 / 3 pts · 100%");
    const bars = screen.getAllByTestId("sprint-progress-bar");
    expect(bars).toHaveLength(2);
    for (const bar of bars) {
      expect(bar.className).toMatch(/bg-emerald-/);
      expect(bar).toHaveStyle({ width: "100%" });
    }
  });

  it("counts tested and user_testing toward the total but not done on the factory ladder", async () => {
    setup(
      [sprint(20, "active")],
      [story(1, 20, "tested", 2), story(2, 20, "user_testing", 1), story(3, 20, "done", 1)],
      "factory",
    );
    const text = await screen.findByText("1 / 4 pts · 25%");
    expect(screen.getByTestId("sprint-progress-bar").className).toMatch(/bg-blue-/);
    expect(text.getAttribute("title")).not.toMatch(/user_testing|integrated_tests/);
  });
});
