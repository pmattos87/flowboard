import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { UserStoryBoard } from "@/features/boards/UserStoryBoard";
import { useUiStore } from "@/stores/uiStore";

const mockInvoke = vi.mocked(invoke);

const mixedTasks = [
  {
    id: 1, project_id: 1, sprint_id: null, parent_id: null,
    title: "User story alpha", description: "", type: "story", status: "todo",
    priority: "medium", assignee_id: null, story_points: 2, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
  {
    id: 2, project_id: 1, sprint_id: null, parent_id: null,
    title: "Bug report beta", description: "", type: "bug", status: "todo",
    priority: "high", assignee_id: null, story_points: 1, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
  {
    id: 3, project_id: 1, sprint_id: null, parent_id: null,
    title: "Epic gamma", description: "", type: "epic", status: "todo",
    priority: "low", assignee_id: null, story_points: 8, due_date: null,
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
      if (cmd === "list_sprints") return Promise.resolve([]);
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
});
