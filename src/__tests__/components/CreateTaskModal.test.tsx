import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { CreateTaskModal } from "@/components/CreateTaskModal";
import { useUiStore } from "@/stores/uiStore";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockInvoke = vi.mocked(invoke);
const mockToast = vi.mocked(toast);

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CreateTaskModal />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockToast.warning.mockReset();
  useUiStore.setState({
    activeProjectId: null,
    createTaskModalOpen: false,
    createTaskPrefill: null,
    selectedTaskId: null,
    selectedSprintId: null,
  });
});

describe("CreateTaskModal — visibility", () => {
  it("is not visible when modal is closed", () => {
    renderModal();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows 'select project' message when open with no active project", () => {
    useUiStore.setState({ createTaskModalOpen: true, activeProjectId: null });
    renderModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });
});

describe("CreateTaskModal — form", () => {
  beforeEach(() => {
    mockInvoke.mockResolvedValue([]);
    useUiStore.setState({ createTaskModalOpen: true, activeProjectId: 1 });
  });

  it("renders all core form fields when open with a project", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/priority/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sprint/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/assignee/i)).toBeInTheDocument();
  });

  it("renders type selector buttons", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Story" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Bug" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subtask" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Epic" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Task" })).not.toBeInTheDocument();
  });

  it("words the issue as a subtask in title, submit button and placeholder", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Create subtask" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Create subtask" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Subtask title")).toBeInTheDocument();
  });
});

describe("CreateTaskModal — locked type (story boards)", () => {
  beforeEach(() => {
    mockInvoke.mockResolvedValue([]);
    useUiStore.setState({
      createTaskModalOpen: true,
      activeProjectId: 1,
      createTaskPrefill: { type: "story", lockType: true },
    });
  });

  it("shows only the Story type option and hides the others", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Story" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Bug" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subtask" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Epic" })).not.toBeInTheDocument();
  });

  it("relabels the title and submit button to story", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create story/i })).toBeInTheDocument();
    });
  });

  it("creates a task of type story", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "list_sprints") return Promise.resolve([]);
      if (cmd === "list_tasks") return Promise.resolve([]);
      if (cmd === "create_task") return Promise.resolve(null);
      return Promise.resolve(null);
    });
    renderModal();

    await waitFor(() => expect(screen.getByLabelText(/title/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/title/i), "A story");
    await user.click(screen.getByRole("button", { name: /create story/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "create_task",
        expect.objectContaining({
          payload: expect.objectContaining({ type: "story", title: "A story" }),
        })
      );
    });
  });
});

describe("CreateTaskModal — submission", () => {
  const fakeTask = {
    id: 99,
    project_id: 1,
    sprint_id: null,
    parent_id: null,
    title: "My New Task",
    description: "",
    type: "subtask",
    status: "todo",
    priority: "medium",
    assignee_id: null,
    story_points: 0,
    due_date: null,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    labels: "",
  };

  it("calls create_task with correct payload and closes modal on success", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ createTaskModalOpen: true, activeProjectId: 1 });
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "list_sprints") return Promise.resolve([]);
      if (cmd === "create_task") return Promise.resolve(fakeTask);
      if (cmd === "list_tasks") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderModal();

    await waitFor(() => expect(screen.getByLabelText(/title/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/title/i), "My New Task");

    const submitBtn = screen.getByRole("button", { name: /create/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "create_task",
        expect.objectContaining({
          payload: expect.objectContaining({ title: "My New Task", project_id: 1 }),
        })
      );
      expect(useUiStore.getState().createTaskModalOpen).toBe(false);
    });
  });

  it("blocks creating a story straight into a sprint (FB-90)", async () => {
    const user = userEvent.setup();
    useUiStore.setState({
      createTaskModalOpen: true,
      activeProjectId: 1,
      createTaskPrefill: { type: "story", lockType: true },
    });
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "list_sprints")
        return Promise.resolve([
          { id: 5, project_id: 1, name: "Sprint 1", goal: "", start_date: "2024-01-01", end_date: "2024-01-14", status: "active" },
        ]);
      if (cmd === "list_tasks") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderModal();

    await waitFor(() => expect(screen.getByLabelText(/title/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/title/i), "Premature story");
    // Status defaults to "todo", so the sprint pick is rejected and reverted.
    const sprintSelect = screen.getByLabelText(/sprint/i) as HTMLSelectElement;
    await user.selectOptions(sprintSelect, "5");

    expect(mockToast.warning).toHaveBeenCalled();
    expect(sprintSelect.value).toBe("");

    await user.click(screen.getByRole("button", { name: /create story/i }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "create_task",
        expect.objectContaining({ payload: expect.objectContaining({ sprint_id: null }) }),
      ),
    );
  });

  it("allows creating a ready-for-development story inside a sprint (FB-90)", async () => {
    const user = userEvent.setup();
    useUiStore.setState({
      createTaskModalOpen: true,
      activeProjectId: 1,
      createTaskPrefill: { type: "story", lockType: true },
    });
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "list_sprints")
        return Promise.resolve([
          { id: 5, project_id: 1, name: "Sprint 1", goal: "", start_date: "2024-01-01", end_date: "2024-01-14", status: "active" },
        ]);
      if (cmd === "list_tasks") return Promise.resolve([]);
      if (cmd === "create_task") return Promise.resolve(fakeTask);
      return Promise.resolve(null);
    });
    renderModal();

    await waitFor(() => expect(screen.getByLabelText(/title/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/title/i), "Ready story");
    await user.selectOptions(screen.getByLabelText(/status/i), "ready_for_development");
    await user.selectOptions(screen.getByLabelText(/sprint/i), "5");

    expect(mockToast.warning).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /create story/i }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "create_task",
        expect.objectContaining({ payload: expect.objectContaining({ sprint_id: 5 }) }),
      ),
    );
  });

  it("re-checks the gate at submit when the status changes after the sprint pick (FB-90)", async () => {
    const user = userEvent.setup();
    useUiStore.setState({
      createTaskModalOpen: true,
      activeProjectId: 1,
      createTaskPrefill: { type: "story", lockType: true },
    });
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "list_sprints")
        return Promise.resolve([
          { id: 5, project_id: 1, name: "Sprint 1", goal: "", start_date: "2024-01-01", end_date: "2024-01-14", status: "active" },
        ]);
      if (cmd === "list_tasks") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderModal();

    await waitFor(() => expect(screen.getByLabelText(/title/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/title/i), "Sneaky story");
    // Valid status first so the select's own guard lets the sprint through …
    await user.selectOptions(screen.getByLabelText(/status/i), "ready_for_development");
    await user.selectOptions(screen.getByLabelText(/sprint/i), "5");
    // … then walk the status back.
    await user.selectOptions(screen.getByLabelText(/status/i), "refining");

    await user.click(screen.getByRole("button", { name: /create story/i }));

    await new Promise((r) => setTimeout(r, 50));
    expect(mockToast.warning).toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalledWith("create_task", expect.anything());
  });

  it("does not call create_task when title is empty", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ createTaskModalOpen: true, activeProjectId: 1 });
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_people") return Promise.resolve([]);
      if (cmd === "list_sprints") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderModal();

    await waitFor(() => expect(screen.getByLabelText(/title/i)).toBeInTheDocument());
    const submitBtn = screen.getByRole("button", { name: /create/i });
    await user.click(submitBtn);

    await new Promise((r) => setTimeout(r, 50));
    expect(mockInvoke).not.toHaveBeenCalledWith("create_task", expect.anything());
    expect(useUiStore.getState().createTaskModalOpen).toBe(true);
  });
});

// FB-52: on a Factory project a top-level bug is a Story (a fix), so the
// create-story modal offers Bug and gives it the Story ladder.
describe("CreateTaskModal — bug Stories (FB-52)", () => {
  const project = (ladder: "legacy" | "factory") => ({ id: 1, name: "P", key: "P", ladder });

  function mockProject(ladder: "legacy" | "factory") {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_project") return Promise.resolve(project(ladder));
      if (cmd === "create_task") return Promise.resolve(null);
      return Promise.resolve([]);
    });
  }

  beforeEach(() => {
    useUiStore.setState({
      createTaskModalOpen: true,
      activeProjectId: 1,
      createTaskPrefill: { type: "story", lockType: true },
    });
  });

  it("creates a top-level bug in backlog with the Story statuses on a Factory project", async () => {
    const user = userEvent.setup();
    mockProject("factory");
    renderModal();

    await user.click(await screen.findByRole("button", { name: "Bug" }));
    expect(screen.getByRole("button", { name: "Bug" })).toHaveAttribute("aria-pressed", "true");

    const statusSelect = screen.getByLabelText(/status/i) as HTMLSelectElement;
    const offered = Array.from(statusSelect.options).map((o) => o.value);
    expect(offered.slice(0, 3)).toEqual(["backlog", "refining", "ready"]);
    expect(offered).not.toContain("todo");
    expect(statusSelect.value).toBe("backlog");
    expect(screen.getByLabelText(/points/i)).toBeDisabled();

    await user.type(screen.getByLabelText(/title/i), "Crash on save");
    await user.click(screen.getByRole("button", { name: /create story/i }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "create_task",
        expect.objectContaining({
          payload: expect.objectContaining({
            type: "bug",
            parent_id: null,
            status: "backlog",
            story_points: 0,
            title: "Crash on save",
          }),
        }),
      ),
    );
  });

  it("keeps the create-story modal Story-only on a legacy project", async () => {
    mockProject("legacy");
    renderModal();
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_project", { id: 1 }));
    await screen.findByRole("button", { name: "Story" });
    await new Promise((r) => setTimeout(r, 20)); // let the project query settle
    expect(screen.queryByRole("button", { name: "Bug" })).not.toBeInTheDocument();
  });
});

// FB-224: on a Factory project the create-story modal also creates an epic,
// which opens at `todo` with no sprint and no points.
describe("CreateTaskModal — Factory epics (FB-224)", () => {
  beforeEach(() => {
    useUiStore.setState({
      createTaskModalOpen: true,
      activeProjectId: 1,
      createTaskPrefill: { type: "story", lockType: true },
    });
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_project") return Promise.resolve({ id: 1, name: "P", key: "P", ladder: "factory" });
      if (cmd === "create_task") return Promise.resolve(null);
      return Promise.resolve([]);
    });
  });

  it("creates an epic at todo with no sprint and renders no sprint or points input", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(await screen.findByRole("button", { name: "Epic" }));
    expect(screen.getByRole("button", { name: "Epic" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText(/sprint/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/points/i)).not.toBeInTheDocument();
    expect((screen.getByLabelText(/status/i) as HTMLSelectElement).value).toBe("todo");

    await user.type(screen.getByLabelText(/title/i), "Hosted web app");
    await user.click(screen.getByRole("button", { name: /create epic/i }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "create_task",
        expect.objectContaining({
          payload: expect.objectContaining({
            type: "epic",
            status: "todo",
            parent_id: null,
            story_points: 0,
            title: "Hosted web app",
          }),
        }),
      ),
    );
    const call = mockInvoke.mock.calls.find(([cmd]) => cmd === "create_task");
    const payload = (call?.[1] as { payload: Record<string, unknown> }).payload;
    expect(payload).not.toHaveProperty("sprint_id");
  });

  it("drops a prefilled sprint when Epic is chosen and is not blocked by the sprint gate", async () => {
    useUiStore.setState({ createTaskPrefill: { type: "story", lockType: true, sprint_id: 5 } });
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_project") return Promise.resolve({ id: 1, name: "P", key: "P", ladder: "factory" });
      if (cmd === "list_sprints")
        return Promise.resolve([{ id: 5, project_id: 1, name: "Sprint 5", goal: "", start_date: null, end_date: null, status: "active" }]);
      if (cmd === "create_task") return Promise.resolve(null);
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    renderModal();

    await user.click(await screen.findByRole("button", { name: "Epic" }));
    await user.type(screen.getByLabelText(/title/i), "Epic from sprint view");
    await user.click(screen.getByRole("button", { name: /create epic/i }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "create_task",
        expect.objectContaining({ payload: expect.objectContaining({ type: "epic", status: "todo" }) }),
      ),
    );
    const call = mockInvoke.mock.calls.find(([cmd]) => cmd === "create_task");
    const payload = (call?.[1] as { payload: Record<string, unknown> }).payload;
    expect(payload).not.toHaveProperty("sprint_id");
    expect(mockToast.warning).not.toHaveBeenCalled();
  });
});
