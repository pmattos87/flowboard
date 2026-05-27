import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import ReportsPage from "@/features/reports/ReportsPage";
import { useUiStore } from "@/stores/uiStore";

const mockInvoke = vi.mocked(invoke);

const fakeSprints = [
  {
    id: 1,
    project_id: 1,
    name: "Sprint Alpha",
    goal: "",
    start_date: "2026-05-01",
    end_date: "2026-05-14",
    status: "completed",
  },
  {
    id: 2,
    project_id: 1,
    name: "Sprint Beta",
    goal: "",
    start_date: "2026-05-15",
    end_date: "2026-05-28",
    status: "active",
  },
];

const fakeTasks = [
  {
    id: 1,
    project_id: 1,
    sprint_id: 1,
    parent_id: null,
    title: "Task A",
    description: "",
    type: "task",
    status: "done",
    priority: "medium",
    assignee_id: 1,
    story_points: 3,
    due_date: null,
    created_at: "2026-05-01T10:00:00",
    updated_at: "2026-05-01T10:00:00",
    labels: "",
  },
  {
    id: 2,
    project_id: 1,
    sprint_id: 1,
    parent_id: null,
    title: "Task B",
    description: "",
    type: "task",
    status: "todo",
    priority: "low",
    assignee_id: null,
    story_points: 2,
    due_date: null,
    created_at: "2026-05-02T10:00:00",
    updated_at: "2026-05-02T10:00:00",
    labels: "",
  },
];

const fakePeople = [
  {
    id: 1,
    name: "Alice",
    email: "alice@example.com",
    avatar_color: "#6366f1",
    role: "Dev",
  },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReportsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({
    activeProjectId: null,
    selectedTaskId: null,
    selectedSprintId: null,
    createProjectModalOpen: false,
    createTaskModalOpen: false,
  });
});

describe("Reports — no project selected", () => {
  it("shows select a project prompt", () => {
    renderPage();
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });

  it("still renders the Reports heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /reports/i })).toBeInTheDocument();
  });
});

describe("Reports — with project, loading", () => {
  it("renders page heading while data is loading", () => {
    useUiStore.setState({ activeProjectId: 1 });
    mockInvoke.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("heading", { name: /reports/i })).toBeInTheDocument();
  });
});

describe("Reports — with project, no sprints", () => {
  beforeEach(() => {
    useUiStore.setState({ activeProjectId: 1 });
    // Return empty arrays for all invoke calls
    mockInvoke.mockResolvedValue([]);
  });

  it("renders the Reports heading", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /reports/i })).toBeInTheDocument(),
    );
  });

  it("renders all four chart section headings", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Burndown")).toBeInTheDocument(),
    );
    expect(screen.getByText("Velocity")).toBeInTheDocument();
    expect(screen.getByText("Status Distribution")).toBeInTheDocument();
    expect(screen.getByText("Workload")).toBeInTheDocument();
  });

  it("renders the sprint filter select", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /sprint filter/i })).toBeInTheDocument(),
    );
  });

  it("shows burndown hint when no sprint is selected", async () => {
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText(/select a sprint to view the burndown/i),
      ).toBeInTheDocument(),
    );
  });
});

describe("Reports — with sprints and tasks", () => {
  beforeEach(() => {
    useUiStore.setState({ activeProjectId: 1 });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "list_sprints") return Promise.resolve(fakeSprints);
      if (cmd === "list_tasks") return Promise.resolve(fakeTasks);
      if (cmd === "list_people") return Promise.resolve(fakePeople);
      if (cmd === "list_activity_log_by_sprint") return Promise.resolve([]);
      return Promise.resolve([]);
    });
  });

  it("populates the sprint selector with sprint names", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Sprint Alpha" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("option", { name: "Sprint Beta" })).toBeInTheDocument();
  });

  it("renders chart containers for velocity and workload", async () => {
    renderPage();
    // Velocity should show a bar for Sprint Alpha (completed with done tasks)
    await waitFor(() =>
      expect(screen.getByText("Velocity")).toBeInTheDocument(),
    );
    // Workload should show Alice's task and an Unassigned row
    await waitFor(() =>
      expect(screen.getByText("Workload")).toBeInTheDocument(),
    );
  });
});
