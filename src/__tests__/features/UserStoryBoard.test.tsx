import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { UserStoryBoard } from "@/features/boards/UserStoryBoard";
import { useUiStore } from "@/stores/uiStore";

const mockInvoke = vi.mocked(invoke);

// Sprint 7 is deliberately not "active" so ensureDefaultSprintFilter leaves the
// filter on "all" and each test controls it explicitly.
const fakeSprints = [
  {
    id: 7, project_id: 1, name: "Sprint 1", goal: "", status: "backlog",
    start_date: "2024-01-01", end_date: "2024-01-14",
  },
];

const mixedTasks = [
  {
    id: 1, project_id: 1, sprint_id: 7, parent_id: null,
    title: "User story alpha", description: "", type: "story", status: "todo",
    priority: "medium", assignee_id: null, story_points: 2, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
  {
    id: 2, project_id: 1, sprint_id: 7, parent_id: null,
    title: "Bug report beta", description: "", type: "bug", status: "todo",
    priority: "high", assignee_id: null, story_points: 1, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
  {
    id: 3, project_id: 1, sprint_id: 7, parent_id: null,
    title: "Epic gamma", description: "", type: "epic", status: "todo",
    priority: "low", assignee_id: null, story_points: 8, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
  {
    id: 4, project_id: 1, sprint_id: null, parent_id: null,
    title: "Unscheduled story delta", description: "", type: "story", status: "todo",
    priority: "medium", assignee_id: null, story_points: 3, due_date: null,
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
      <UserStoryBoard />
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
    boardSprintFilterFor: 1,
  });
});

describe("UserStoryBoard — no project", () => {
  it("shows select project prompt when no project is active", () => {
    renderBoard();
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });
});

describe("UserStoryBoard — with project", () => {
  beforeEach(() => {
    useUiStore.setState({ activeProjectId: 1 });
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_tasks") return Promise.resolve(mixedTasks);
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "list_sprints") return Promise.resolve(fakeSprints);
      if (cmd === "get_project") return Promise.resolve(fakeProject);
      return Promise.resolve(null);
    });
  });

  it("renders the board heading", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("User Story Board")).toBeInTheDocument());
  });

  it("shows only story-type tasks", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("User story alpha")).toBeInTheDocument());
    expect(screen.queryByText("Bug report beta")).not.toBeInTheDocument();
    expect(screen.queryByText("Epic gamma")).not.toBeInTheDocument();
  });

  it("hides unscheduled stories under 'All sprints'", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("User story alpha")).toBeInTheDocument());
    // Unscheduled stories live on the Discovery board; showing them here listed
    // the same story twice under two different column names.
    expect(screen.queryByText("Unscheduled story delta")).not.toBeInTheDocument();
  });

  it("does not offer the 'no sprint' filter option", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("User story alpha")).toBeInTheDocument());
    expect(screen.getByRole("option", { name: /all sprints/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /sprint 1/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /ready for development \(no sprint\)/i }),
    ).not.toBeInTheDocument();
  });

  it("falls back to 'All sprints' when arriving with the shared filter on backlog", async () => {
    useUiStore.setState({ boardSprintFilter: "backlog" });
    renderBoard();
    await waitFor(() => expect(screen.getByText("User story alpha")).toBeInTheDocument());
    expect(useUiStore.getState().boardSprintFilter).toBe("all");
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("all");
  });
});
