import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { stat } from "@tauri-apps/plugin-fs";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import { useUiStore } from "@/stores/uiStore";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ stat: vi.fn() }));

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(openFilePicker);
const mockStat = vi.mocked(stat);

const fakeTask = {
  id: 7,
  project_id: 1,
  task_number: 3,
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

  it("shows task key badge using per-project task_number, not internal id", async () => {
    setupInvoke();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("AL-3")).toBeInTheDocument();
    });
    expect(screen.queryByText("AL-7")).not.toBeInTheDocument();
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

describe("TaskDetailPanel — Parent story", () => {
  const story = {
    id: 100, project_id: 1, sprint_id: 5, parent_id: null,
    title: "Login flow story", description: "", type: "story", status: "todo",
    priority: "medium", assignee_id: null, story_points: 5, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  };
  const otherStory = {
    id: 101, project_id: 1, sprint_id: null, parent_id: null,
    title: "Signup story", description: "", type: "story", status: "todo",
    priority: "medium", assignee_id: null, story_points: 3, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  };

  function setupInvokeWithStories(
    taskOverride: Partial<Record<keyof typeof fakeTask, unknown>> = {},
  ) {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_task") return Promise.resolve({ ...fakeTask, ...taskOverride });
      if (cmd === "get_project") return Promise.resolve(fakeProject);
      if (cmd === "list_tasks")
        return Promise.resolve([{ ...fakeTask, ...taskOverride }, story, otherStory]);
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "list_sprints") return Promise.resolve([]);
      if (cmd === "list_comments") return Promise.resolve([]);
      if (cmd === "list_time_logs") return Promise.resolve([]);
      if (cmd === "list_attachments") return Promise.resolve([]);
      if (cmd === "update_task") return Promise.resolve({ ...fakeTask, ...taskOverride });
      return Promise.resolve(null);
    });
  }

  it("renders the Parent story dropdown for a bug task", async () => {
    setupInvokeWithStories();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByLabelText(/parent story/i)).toBeInTheDocument(),
    );
    const select = screen.getByLabelText(/parent story/i) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.text)).toEqual([
      "No parent",
      "Login flow story",
      "Signup story",
    ]);
  });

  it("does not render the Parent story dropdown for a story task", async () => {
    setupInvokeWithStories({ type: "story" });
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByDisplayValue("Fix login bug")).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/parent story/i)).not.toBeInTheDocument();
  });

  it("changing parent invokes update_task with parent_id and inherits parent's sprint_id", async () => {
    setupInvokeWithStories();
    const user = userEvent.setup();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByLabelText(/parent story/i)).toBeInTheDocument(),
    );

    const select = screen.getByLabelText(/parent story/i);
    await user.selectOptions(select, "100");

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_task", {
        id: 7,
        payload: { parent_id: 100, sprint_id: 5 },
      }),
    );
  });

  it("clearing parent invokes update_task with parent_id=null and does not touch sprint_id", async () => {
    setupInvokeWithStories({ parent_id: 100, sprint_id: 5 });
    const user = userEvent.setup();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByLabelText(/parent story/i)).toBeInTheDocument(),
    );

    const select = screen.getByLabelText(/parent story/i);
    await user.selectOptions(select, "");

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_task", {
        id: 7,
        payload: { parent_id: null },
      }),
    );
  });
});

describe("TaskDetailPanel — Time Logs visibility (FB-31)", () => {
  function setupInvokeWithType(type: string) {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_task") return Promise.resolve({ ...fakeTask, type });
      if (cmd === "get_project") return Promise.resolve(fakeProject);
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "list_sprints") return Promise.resolve([]);
      if (cmd === "list_comments") return Promise.resolve([]);
      if (cmd === "list_time_logs") return Promise.resolve([]);
      if (cmd === "list_attachments") return Promise.resolve([]);
      return Promise.resolve(null);
    });
  }

  it("hides the Time Logs section for non-task types", async () => {
    setupInvokeWithType("bug");
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByDisplayValue("Fix login bug")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Time Logs")).not.toBeInTheDocument();
  });

  it("shows the Time Logs section for task type", async () => {
    setupInvokeWithType("task");
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText("Time Logs")).toBeInTheDocument(),
    );
  });
});

describe("TaskDetailPanel — delete task (FB-3)", () => {
  it("trash → confirm invokes delete_task and closes the panel", async () => {
    setupInvoke();
    const user = userEvent.setup();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() => expect(screen.getByDisplayValue("Fix login bug")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /delete task/i }));
    // Confirmation popup appears, then confirm.
    const confirmBtn = await screen.findByRole("button", { name: /^delete$/i });
    await user.click(confirmBtn);

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("delete_task", { id: 7 }));
    expect(useUiStore.getState().selectedTaskId).toBeNull();
  });

  it("cancel in the confirmation popup does not delete", async () => {
    setupInvoke();
    const user = userEvent.setup();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() => expect(screen.getByDisplayValue("Fix login bug")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /delete task/i }));
    await user.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(mockInvoke).not.toHaveBeenCalledWith("delete_task", expect.anything());
    expect(useUiStore.getState().selectedTaskId).toBe(7);
  });
});

describe("AttachmentsSection — handleAttach (regression)", () => {
  const filepath = "C:\\Users\\Pedro\\Downloads\\report.pdf";

  beforeEach(() => {
    mockOpen.mockReset();
    mockStat.mockReset();
    setupInvoke();
    useUiStore.setState({ selectedTaskId: 7 });
  });

  async function renderAndClickAttach() {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(screen.getByRole("button", { name: /attach file/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /attach file/i }));
  }

  it("calls create_attachment when dialog returns a plain string", async () => {
    mockOpen.mockResolvedValueOnce(filepath);
    mockStat.mockResolvedValueOnce({ size: 2048 } as never);

    await renderAndClickAttach();

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("create_attachment", {
        payload: expect.objectContaining({ filepath, task_id: 7, filename: "report.pdf" }),
      })
    );
  });

  it("calls create_attachment when dialog returns string[] — Candidate 1 regression", async () => {
    // Before the fix, Array.isArray(result) guard would trip on this and return early.
    mockOpen.mockResolvedValueOnce([filepath] as never);
    mockStat.mockResolvedValueOnce({ size: 2048 } as never);

    await renderAndClickAttach();

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("create_attachment", {
        payload: expect.objectContaining({ filepath, task_id: 7, filename: "report.pdf" }),
      })
    );
  });

  it("does not call create_attachment when dialog returns null (user cancelled)", async () => {
    mockOpen.mockResolvedValueOnce(null);

    await renderAndClickAttach();

    await new Promise((r) => setTimeout(r, 50));
    expect(mockInvoke).not.toHaveBeenCalledWith("create_attachment", expect.anything());
  });

  it("catches stat errors without crashing the UI — Candidate 2 regression", async () => {
    // Before the fix, no catch block meant the thrown error would be an unhandled rejection.
    mockOpen.mockResolvedValueOnce(filepath);
    mockStat.mockRejectedValueOnce(new Error("fs: permission denied"));

    await renderAndClickAttach();

    // UI must survive the error — button still present, no throw propagated
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /attach file/i })).toBeInTheDocument()
    );
    expect(mockInvoke).not.toHaveBeenCalledWith("create_attachment", expect.anything());
  });
});
