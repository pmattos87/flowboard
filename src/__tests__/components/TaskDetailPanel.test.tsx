import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import { useUiStore } from "@/stores/uiStore";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ stat: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

const fakeTask = {
  id: 7,
  project_id: 1,
  sprint_id: null,
  parent_id: null,
  title: "Fix login bug",
  description: "The login page crashes.",
  type: "bug",
  status: "in_progress",
  priority: "high",
  assignee_id: null,
  story_points: 3,
  due_date: null,
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
  labels: "",
};

const fakeProject = {
  id: 1,
  name: "Alpha",
  key: "AL",
  description: "",
  color: "#6366f1",
  created_at: "2024-01-01T00:00:00.000Z",
};

function setupInvoke() {
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "get_task") return Promise.resolve(fakeTask);
    if (cmd === "get_project") return Promise.resolve(fakeProject);
    if (cmd === "list_people") return Promise.resolve([]);
    if (cmd === "list_sprints") return Promise.resolve([]);
    if (cmd === "list_comments") return Promise.resolve([]);
    if (cmd === "list_time_logs") return Promise.resolve([]);
    if (cmd === "list_attachments") return Promise.resolve([]);
    return Promise.resolve(null);
  });
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TaskDetailPanel />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({ selectedTaskId: null, activeProjectId: null, selectedSprintId: null });
});

describe("TaskDetailPanel — hidden state", () => {
  it("panel is translated off-screen when no task is selected", () => {
    renderPanel();
    const panel = document.querySelector(".translate-x-full");
    expect(panel).toBeInTheDocument();
  });

  it("no backdrop is rendered when selectedTaskId is null", () => {
    renderPanel();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });
});

describe("TaskDetailPanel — open state", () => {
  it("shows panel with task title after task loads", async () => {
    setupInvoke();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByDisplayValue("Fix login bug")).toBeInTheDocument();
    });
  });

  it("shows task key badge in header", async () => {
    setupInvoke();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("AL-7")).toBeInTheDocument();
    });
  });

  it("shows 'No comments yet' when comments list is empty", async () => {
    setupInvoke();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();
    });
  });

  it("close button clears selectedTaskId", async () => {
    setupInvoke();
    const user = userEvent.setup();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() => expect(screen.getByDisplayValue("Fix login bug")).toBeInTheDocument());

    const closeBtn = screen.getByRole("button", { name: /close panel/i });
    await user.click(closeBtn);
    expect(useUiStore.getState().selectedTaskId).toBeNull();
  });
});
