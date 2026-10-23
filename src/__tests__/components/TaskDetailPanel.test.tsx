import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import { useUiStore } from "@/stores/uiStore";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(openFilePicker);
const mockToast = vi.mocked(toast);

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
  mockToast.warning.mockReset();
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

describe("TaskDetailPanel — Subtask wording (FB-123)", () => {
  it("labels a subtask row's badge, cancel control and title placeholder as Subtask", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_task") return Promise.resolve({ ...fakeTask, type: "subtask" });
      if (cmd === "get_project") return Promise.resolve(fakeProject);
      return Promise.resolve([]);
    });
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() => expect(screen.getByDisplayValue("Fix login bug")).toBeInTheDocument());
    expect(screen.getByText("Subtask")).toBeInTheDocument();
    expect(screen.getByLabelText("Cancel subtask")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Subtask title")).toBeInTheDocument();
  });
});

describe("TaskDetailPanel — Markdown description (FB-100)", () => {
  it("saves the edited raw Markdown unchanged via update_task", async () => {
    setupInvoke();
    const user = userEvent.setup();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() => expect(screen.getByText("The login page crashes.")).toBeInTheDocument());

    const raw = "## Steps\n\n- open `/login`\n- submit  \n\n```\nTypeError\n```\n";
    await user.click(screen.getByRole("button", { name: /edit description/i }));
    fireEvent.change(screen.getByDisplayValue("The login page crashes."), { target: { value: raw } });
    await user.tab();

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_task", { id: 7, payload: { description: raw } }),
    );
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
    setupInvokeWithType("subtask");
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText("Time Logs")).toBeInTheDocument(),
    );
  });
});

describe("TaskDetailPanel — cancel task (FB-3, FB-98)", () => {
  function setupWithTask(taskOverride: Record<string, unknown>) {
    const t = { ...fakeTask, ...taskOverride };
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_task") return Promise.resolve(t);
      if (cmd === "get_project") return Promise.resolve(fakeProject);
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "list_sprints") return Promise.resolve([]);
      if (cmd === "list_tasks") return Promise.resolve([t]);
      if (cmd === "list_comments") return Promise.resolve([]);
      if (cmd === "list_time_logs") return Promise.resolve([]);
      if (cmd === "list_attachments") return Promise.resolve([]);
      if (cmd === "update_task") return Promise.resolve(t);
      return Promise.resolve(null);
    });
  }

  function statusSelect() {
    return screen.getAllByRole("combobox").find((el) =>
      Array.from((el as HTMLSelectElement).options).some((o) => o.value === "canceled"),
    ) as HTMLSelectElement;
  }

  // Every non-read command invoked since call index `from`. "Never deletes"
  // means the only write a Cancel makes is update_task.
  function writesSince(from: number) {
    return mockInvoke.mock.calls
      .slice(from)
      .map(([cmd]) => cmd)
      .filter((cmd) => !/^(get|list)_/.test(cmd));
  }

  it("Cancel task sets status canceled, never deletes, opens no dialog and keeps the panel open", async () => {
    setupWithTask({});
    const user = userEvent.setup();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() => expect(screen.getByDisplayValue("Fix login bug")).toBeInTheDocument());

    const before = mockInvoke.mock.calls.length;
    await user.click(screen.getByRole("button", { name: /cancel subtask/i }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_task", {
        id: 7,
        payload: { status: "canceled" },
      }),
    );
    expect(writesSince(before)).toEqual(["update_task"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useUiStore.getState().selectedTaskId).toBe(7);
    expect(statusSelect().value).toBe("canceled");
  });

  it("hides Cancel task when the issue is already canceled", async () => {
    setupWithTask({ status: "canceled" });
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() => expect(screen.getByDisplayValue("Fix login bug")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: /cancel subtask/i })).not.toBeInTheDocument();
  });

  it("hides Cancel task when the issue is done", async () => {
    setupWithTask({ status: "done" });
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() => expect(screen.getByDisplayValue("Fix login bug")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: /cancel subtask/i })).not.toBeInTheDocument();
  });

  it("reopens a canceled issue through the Status picker", async () => {
    setupWithTask({ status: "canceled" });
    const user = userEvent.setup();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() => expect(screen.getByDisplayValue("Fix login bug")).toBeInTheDocument());

    await user.selectOptions(statusSelect(), "todo");

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_task", {
        id: 7,
        payload: { status: "todo" },
      }),
    );
  });

  it("on a factory-ladder Story, cancels and then reopens to backlog through update_task", async () => {
    let current: Record<string, unknown> = {
      ...fakeTask,
      type: "story",
      status: "refining",
    };
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_task") return Promise.resolve(current);
      if (cmd === "get_project") return Promise.resolve({ ...fakeProject, ladder: "factory" });
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "list_sprints") return Promise.resolve([]);
      if (cmd === "list_tasks") return Promise.resolve([current]);
      if (cmd === "list_comments") return Promise.resolve([]);
      if (cmd === "list_time_logs") return Promise.resolve([]);
      if (cmd === "list_attachments") return Promise.resolve([]);
      if (cmd === "update_task") {
        const { payload } = args as { payload: Record<string, unknown> };
        current = { ...current, ...payload };
        return Promise.resolve(current);
      }
      return Promise.resolve(null);
    });
    const user = userEvent.setup();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();
    await waitFor(() => expect(screen.getByDisplayValue("Fix login bug")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /cancel subtask/i }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_task", {
        id: 7,
        payload: { status: "canceled" },
      }),
    );
    // After the refetch the Cancel button is gone and the picker shows canceled.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /cancel subtask/i })).not.toBeInTheDocument(),
    );
    const select = statusSelect();
    expect(select.value).toBe("canceled");
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("backlog");

    await user.selectOptions(select, "backlog");
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_task", {
        id: 7,
        payload: { status: "backlog" },
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /cancel subtask/i })).toBeInTheDocument(),
    );
    // Cancel and reopen are the only writes: two update_task calls, no delete.
    expect(writesSince(0)).toEqual(["update_task", "update_task"]);
  });
});

describe("TaskDetailPanel — Sprint gate (FB-90)", () => {
  const sprints = [
    { id: 5, project_id: 1, name: "Sprint 1", goal: "", start_date: "2024-01-01", end_date: "2024-01-14", status: "active" },
  ];

  function setupWithSprints(taskOverride: Record<string, unknown>) {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_task") return Promise.resolve({ ...fakeTask, ...taskOverride });
      if (cmd === "get_project") return Promise.resolve(fakeProject);
      if (cmd === "list_sprints") return Promise.resolve(sprints);
      if (cmd === "list_tasks") return Promise.resolve([{ ...fakeTask, ...taskOverride }]);
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "list_comments") return Promise.resolve([]);
      if (cmd === "list_time_logs") return Promise.resolve([]);
      if (cmd === "list_attachments") return Promise.resolve([]);
      if (cmd === "update_task") return Promise.resolve({ ...fakeTask, ...taskOverride });
      return Promise.resolve(null);
    });
  }

  async function pickSprint() {
    const user = userEvent.setup();
    renderPanel();
    const select = await screen.findByRole("combobox", { name: /sprint/i });
    await user.selectOptions(select, "5");
    return select as HTMLSelectElement;
  }

  it("blocks a story that is not ready for development and reverts the select", async () => {
    setupWithSprints({ type: "story", status: "todo", sprint_id: null });
    useUiStore.setState({ selectedTaskId: 7 });

    const select = await pickSprint();

    expect(mockToast.warning).toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalledWith("update_task", expect.anything());
    expect(select.value).toBe("");
  });

  it("moves a ready-for-development story into the dev workflow with the sprint", async () => {
    setupWithSprints({ type: "story", status: "ready_for_development", sprint_id: null });
    useUiStore.setState({ selectedTaskId: 7 });

    await pickSprint();

    // Status must follow, exactly as a planning-board drop does. Leaving it at
    // ready_for_development strands the story: it is in a sprint, but the User
    // Story Board renders the dev-workflow columns and has none for it.
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_task", {
        id: 7,
        payload: { sprint_id: 5, status: "todo" },
      }),
    );
    expect(mockToast.warning).not.toHaveBeenCalled();
  });

  it("restores ready_for_development when the sprint is cleared", async () => {
    setupWithSprints({ type: "story", status: "in_progress", sprint_id: 5 });
    useUiStore.setState({ selectedTaskId: 7 });
    const user = userEvent.setup();
    renderPanel();

    const select = await screen.findByRole("combobox", { name: /sprint/i });
    await user.selectOptions(select, "");

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_task", {
        id: 7,
        payload: { sprint_id: null, status: "ready_for_development" },
      }),
    );
  });

  it("does not gate a bug, nor rewrite its status — only stories run the discovery lifecycle", async () => {
    setupWithSprints({ type: "bug", status: "in_progress", sprint_id: null });
    useUiStore.setState({ selectedTaskId: 7 });

    await pickSprint();

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_task", { id: 7, payload: { sprint_id: 5 } }),
    );
    expect(mockToast.warning).not.toHaveBeenCalled();
  });
});

describe("CommentsSection — edit a comment (FB-46)", () => {
  const person = { id: 1, name: "Pedro", role: "", avatar_color: "#6366f1", avatar_data: null };
  const comment = {
    id: 42, task_id: 7, author_id: 1, body: "Original body",
    created_at: "2024-01-01T00:00:00.000Z", updated_at: null,
  };

  function setupWithComment(c: Record<string, unknown> = {}) {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_task") return Promise.resolve(fakeTask);
      if (cmd === "get_project") return Promise.resolve(fakeProject);
      if (cmd === "list_people") return Promise.resolve([person]);
      if (cmd === "list_sprints") return Promise.resolve([]);
      if (cmd === "list_comments") return Promise.resolve([{ ...comment, ...c }]);
      if (cmd === "list_time_logs") return Promise.resolve([]);
      if (cmd === "list_attachments") return Promise.resolve([]);
      if (cmd === "update_comment")
        return Promise.resolve({ ...comment, ...c, body: "Edited body", updated_at: "2024-01-02T00:00:00.000Z" });
      return Promise.resolve(null);
    });
  }

  it("pencil → edit → Save invokes update_comment with the new body", async () => {
    setupWithComment();
    const user = userEvent.setup();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /edit comment/i }));

    const textarea = screen.getByLabelText(/edit comment body/i);
    expect(textarea).toHaveValue("Original body");
    await user.clear(textarea);
    await user.type(textarea, "Edited body");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_comment", { id: 42, body: "Edited body" }),
    );
  });

  it("Cancel leaves the comment untouched", async () => {
    setupWithComment();
    const user = userEvent.setup();
    useUiStore.setState({ selectedTaskId: 7 });
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /edit comment/i }));
    await user.clear(screen.getByLabelText(/edit comment body/i));
    await user.type(screen.getByLabelText(/edit comment body/i), "Discarded");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(mockInvoke).not.toHaveBeenCalledWith("update_comment", expect.anything());
    expect(screen.getByText("Original body")).toBeInTheDocument();
  });

  it("shows '(edited)' only once updated_at is set", async () => {
    setupWithComment();
    useUiStore.setState({ selectedTaskId: 7 });
    const { unmount } = renderPanel();
    await screen.findByText("Original body");
    expect(screen.queryByText("(edited)")).not.toBeInTheDocument();
    unmount();

    setupWithComment({ updated_at: "2024-01-02T00:00:00.000Z" });
    renderPanel();
    expect(await screen.findByText("(edited)")).toBeInTheDocument();
  });
});

describe("AttachmentsSection — handleAttach (regression)", () => {
  const filepath = "C:\\Users\\Pedro\\Downloads\\report.pdf";

  beforeEach(() => {
    mockOpen.mockReset();
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

    await renderAndClickAttach();

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("create_attachment", {
        payload: expect.objectContaining({
          filepath,
          task_id: 7,
          filename: "report.pdf",
          mime_type: "application/pdf",
        }),
      })
    );
  });

  it("calls create_attachment when dialog returns string[] — Candidate 1 regression", async () => {
    // Before the fix, Array.isArray(result) guard would trip on this and return early.
    mockOpen.mockResolvedValueOnce([filepath] as never);

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

  it("catches create_attachment errors without crashing the UI — Candidate 2 regression", async () => {
    // The handler's try/catch must absorb a failed backend write (the file read
    // now happens in Rust) rather than throwing an unhandled rejection.
    mockOpen.mockResolvedValueOnce(filepath);
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "create_attachment") return Promise.reject(new Error("db write failed"));
      if (cmd === "get_task") return Promise.resolve(fakeTask);
      if (cmd === "get_project") return Promise.resolve(fakeProject);
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "list_sprints") return Promise.resolve([]);
      if (cmd === "list_comments") return Promise.resolve([]);
      if (cmd === "list_time_logs") return Promise.resolve([]);
      if (cmd === "list_attachments") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    await renderAndClickAttach();

    // UI must survive the error — button still present, no throw propagated.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /attach file/i })).toBeInTheDocument()
    );
  });
});
