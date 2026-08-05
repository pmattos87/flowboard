import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { SprintPlanningBoard } from "@/features/boards/SprintPlanningBoard";
import { useUiStore } from "@/stores/uiStore";

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
      <SprintPlanningBoard />
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
