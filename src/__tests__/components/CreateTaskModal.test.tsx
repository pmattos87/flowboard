import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { CreateTaskModal } from "@/components/CreateTaskModal";
import { useUiStore } from "@/stores/uiStore";

const mockInvoke = vi.mocked(invoke);

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
    expect(screen.getByRole("button", { name: "Task" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Epic" })).toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: "Task" })).not.toBeInTheDocument();
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
    type: "task",
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
