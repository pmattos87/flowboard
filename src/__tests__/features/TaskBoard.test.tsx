import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { TaskBoard } from "@/features/boards/TaskBoard";
import { useUiStore } from "@/stores/uiStore";

const mockInvoke = vi.mocked(invoke);

const allTypeTasks = [
  {
    id: 1, project_id: 1, sprint_id: null, parent_id: null,
    title: "A story task", description: "", type: "story", status: "todo",
    priority: "medium", assignee_id: null, story_points: 2, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
  {
    id: 2, project_id: 1, sprint_id: null, parent_id: null,
    title: "A bug task", description: "", type: "bug", status: "in_progress",
    priority: "high", assignee_id: null, story_points: 1, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
  {
    id: 3, project_id: 1, sprint_id: null, parent_id: null,
    title: "A regular task", description: "", type: "task", status: "in_review",
    priority: "low", assignee_id: null, story_points: 3, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
  {
    id: 4, project_id: 1, sprint_id: null, parent_id: null,
    title: "An epic task", description: "", type: "epic", status: "done",
    priority: "critical", assignee_id: null, story_points: 13, due_date: null,
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
      <TaskBoard />
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

describe("TaskBoard — no project", () => {
  it("shows select project prompt", () => {
    renderBoard();
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });
});

describe("TaskBoard — with project", () => {
  beforeEach(() => {
    useUiStore.setState({ activeProjectId: 1 });
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_tasks") return Promise.resolve(allTypeTasks);
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "list_sprints") return Promise.resolve([]);
      if (cmd === "get_project") return Promise.resolve(fakeProject);
      return Promise.resolve(null);
    });
  });

  it("renders the board heading", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Task Board")).toBeInTheDocument());
  });

  it("renders stories as row headers and tasks/bugs as Unparented children; excludes epics", async () => {
    renderBoard();
    // Story shows up as a row header.
    await waitFor(() => expect(screen.getByText("A story task")).toBeInTheDocument());
    // Tasks and bugs with parent_id=null go into the Unparented row.
    expect(screen.getByText("Unparented")).toBeInTheDocument();
    // Groups are collapsed by default — expand the Unparented row to see its children.
    fireEvent.click(screen.getByLabelText("Expand group"));
    expect(screen.getByText("A bug task")).toBeInTheDocument();
    expect(screen.getByText("A regular task")).toBeInTheDocument();
    // Epics are not surfaced on the Task Board at all (they live on Discovery).
    expect(screen.queryByText("An epic task")).not.toBeInTheDocument();
  });

  it("collapses all groups by default, hiding their children until expanded", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Unparented")).toBeInTheDocument());
    // Children are hidden while collapsed.
    expect(screen.queryByText("A bug task")).not.toBeInTheDocument();
    expect(screen.queryByText("A regular task")).not.toBeInTheDocument();
    // Expanding reveals them.
    fireEvent.click(screen.getByLabelText("Expand group"));
    expect(screen.getByText("A bug task")).toBeInTheDocument();
  });
});
