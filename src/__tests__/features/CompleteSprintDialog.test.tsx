import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { CompleteSprintDialog } from "@/features/sprints/CompleteSprintDialog";
import type { Project, Sprint, Task, TaskStatus, TaskType } from "@/types";

const mockInvoke = vi.mocked(invoke);

const sprint = (id: number, status: Sprint["status"], start: string): Sprint => ({
  id, project_id: 1, name: `Sprint ${id}`, goal: "", status,
  start_date: start, end_date: start,
});

let nextNumber = 1;
const task = (
  id: number,
  sprintId: number | null,
  status: TaskStatus,
  type: TaskType = "story",
  parentId: number | null = null,
): Task =>
  ({
    id, project_id: 1, task_number: nextNumber++, sprint_id: sprintId, parent_id: parentId,
    title: `Task ${id}`, description: "", type, status, priority: "medium",
    assignee_id: null, story_points: 1, due_date: null, labels: "",
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z",
  }) as Task;

const legacy: Pick<Project, "key" | "ladder"> = { key: "FB", ladder: "legacy" };
const factory: Pick<Project, "key" | "ladder"> = { key: "FB", ladder: "factory" };

const source = sprint(20, "active", "2024-03-01");

function renderDialog(
  sprints: Sprint[],
  tasks: Task[],
  project: Pick<Project, "key" | "ladder"> = legacy,
  onOpenChange = vi.fn(),
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CompleteSprintDialog
        open
        onOpenChange={onOpenChange}
        sprint={source}
        sprints={sprints}
        tasks={tasks}
        project={project}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

const confirmButton = () => screen.getByRole("button", { name: "Complete sprint" });

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(source);
  nextNumber = 1;
});

describe("CompleteSprintDialog", () => {
  it("counts only unfinished issues, defaults to the next sprint by start date and sends it", async () => {
    const user = userEvent.setup();
    const later = sprint(22, "backlog", "2024-05-01");
    const next = sprint(21, "backlog", "2024-04-01");
    const done = sprint(19, "completed", "2024-02-01");
    const { onOpenChange } = renderDialog(
      [done, source, later, next],
      [
        task(1, 20, "in_progress"),
        task(2, 20, "todo", "bug"),
        task(3, 20, "done"),
        task(4, 20, "canceled"),
        task(5, 21, "todo"),
      ],
    );

    expect(screen.getByText(/^2 unfinished issues will move/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Sprint 21" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Sprint 22" })).not.toBeChecked();
    expect(screen.queryByRole("radio", { name: "Sprint 19" })).not.toBeInTheDocument();

    await user.click(confirmButton());
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("complete_sprint", {
        sprintId: 20,
        target: { kind: "sprint", sprintId: 21 },
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("disables Backlog with its reason on a Factory project with a Story past ready", () => {
    renderDialog(
      [source, sprint(21, "backlog", "2024-04-01")],
      [task(1, 20, "building"), task(2, 20, "ready")],
      factory,
    );
    const backlog = screen.getByRole("radio", { name: /backlog/i });
    expect(backlog).toBeDisabled();
    expect(
      screen.getByText(/a Story enters or leaves a sprint only at ready; FB-1 is building/),
    ).toBeInTheDocument();
  });

  it("offers Backlog on a legacy project and sends the backlog target", async () => {
    const user = userEvent.setup();
    renderDialog([source, sprint(21, "backlog", "2024-04-01")], [task(1, 20, "in_progress")]);
    const backlog = screen.getByRole("radio", { name: /backlog/i });
    expect(backlog).toBeEnabled();
    await user.click(backlog);
    await user.click(confirmButton());
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("complete_sprint", {
        sprintId: 20,
        target: { kind: "backlog" },
      }),
    );
  });

  it("asks for a new sprint when no open sprint is left and sends its fields", async () => {
    const user = userEvent.setup();
    renderDialog([source, sprint(19, "completed", "2024-02-01")], [task(1, 20, "todo")]);

    expect(screen.getByRole("radio", { name: "A new sprint" })).toBeChecked();
    expect(confirmButton()).toBeDisabled();

    await user.type(screen.getByLabelText("Name"), "Sprint 21");
    await user.type(screen.getByLabelText("Start date"), "2024-03-15");
    await user.type(screen.getByLabelText("End date"), "2024-03-28");
    expect(confirmButton()).toBeEnabled();

    await user.click(confirmButton());
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("complete_sprint", {
        sprintId: 20,
        target: { kind: "new", name: "Sprint 21", startDate: "2024-03-15", endDate: "2024-03-28" },
      }),
    );
  });

  it("keeps Confirm disabled while the new sprint ends before it starts (QA)", async () => {
    const user = userEvent.setup();
    renderDialog([source], [task(1, 20, "todo")]);
    await user.type(screen.getByLabelText("Name"), "Sprint 21");
    await user.type(screen.getByLabelText("Start date"), "2024-03-15");
    await user.type(screen.getByLabelText("End date"), "2024-03-10");
    expect(screen.getByText("End date must be on or after start date.")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it("enables Backlog on a Factory project when every unfinished Story is at ready (QA)", async () => {
    const user = userEvent.setup();
    renderDialog(
      [source, sprint(21, "backlog", "2024-04-01")],
      [task(1, 20, "ready"), task(2, 20, "done"), task(3, 20, "todo", "bug")],
      factory,
    );
    const backlog = screen.getByRole("radio", { name: /backlog/i });
    expect(backlog).toBeEnabled();
    expect(screen.queryByText(/Not available/)).not.toBeInTheDocument();
    await user.click(backlog);
    await user.click(confirmButton());
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("complete_sprint", {
        sprintId: 20,
        target: { kind: "backlog" },
      }),
    );
  });

  it("lists done Stories with open Subtasks and keeps Confirm disabled", () => {
    const story = task(1, 20, "done");
    renderDialog(
      [source, sprint(21, "backlog", "2024-04-01")],
      [story, task(2, 20, "todo", "subtask", 1), task(3, 21, "done", "subtask", 1)],
    );
    expect(screen.getByText("FB-1")).toBeInTheDocument();
    expect(screen.getByText(/FB-2/)).toBeInTheDocument();
    expect(screen.queryByText(/FB-3/)).not.toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it("shows the backend's refusal inside the dialog and stays open", async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue("sprint 20 is not active");
    const { onOpenChange } = renderDialog(
      [source, sprint(21, "backlog", "2024-04-01")],
      [task(1, 20, "todo")],
    );
    await user.click(confirmButton());
    expect(await screen.findByText("sprint 20 is not active")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
