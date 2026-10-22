import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { StorySubtasks } from "@/features/story/StorySubtasks";
import { useUiStore } from "@/stores/uiStore";
import type { Task } from "@/types";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockInvoke = vi.mocked(invoke);

function task(over: Partial<Task>): Task {
  return {
    id: 1, project_id: 1, task_number: 1, sprint_id: 3, parent_id: null,
    title: "", description: "", type: "task", status: "todo", priority: "medium",
    assignee_id: null, story_points: 0, due_date: null, created_at: "", updated_at: "",
    labels: "", feature_branch: null, review_verdict: null, reviewed_commit: null,
    findings_url: null, run_stopped: false, risk: false, release_id: null,
    ...over,
  };
}

const story = task({ id: 10, task_number: 10, type: "story", status: "building", run_stopped: true });
const subtasks = [
  task({ id: 11, task_number: 11, parent_id: 10, title: "Template layout", status: "done" }),
  task({ id: 12, task_number: 12, parent_id: 10, title: "Signature block", status: "in_progress" }),
  task({ id: 13, task_number: 13, parent_id: 10, title: "Dropped idea", status: "canceled" }),
  task({ id: 99, task_number: 99, parent_id: null, title: "Someone else's", status: "todo" }),
];
const trail = [
  { at: "", action: "subtask_handoff", old: "", new: { subtask: "FB-11", agent: "implementer", model: "sonnet" }, by: "Claude" },
  { at: "", action: "verify_round", old: "", new: { subtask: "FB-11", round: 1, result: "pass" }, by: "Claude" },
  { at: "", action: "verify_round", old: "", new: { subtask: "FB-12", round: 1, result: "fail" }, by: "Claude" },
  { at: "", action: "verify_round", old: "", new: { subtask: "FB-12", round: 2, result: "fail" }, by: "Claude" },
];

function renderSubtasks(s: Task = story) {
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "list_tasks") return Promise.resolve([s, ...subtasks]);
    if (cmd === "get_story_trail") return Promise.resolve(trail);
    return Promise.resolve([]);
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StorySubtasks story={s} storyKey="FB-10" projectKey="FB" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({ selectedTaskId: null });
});

describe("StorySubtasks", () => {
  it("shows only this Story's Subtasks in the four Subtask columns", async () => {
    renderSubtasks();
    expect(await screen.findByText("Template layout")).toBeInTheDocument();
    expect(screen.getByText("Dropped idea")).toBeInTheDocument();
    expect(screen.queryByText("Someone else's")).not.toBeInTheDocument();
    for (const col of ["TO DO", "IN PROGRESS", "CANCELED", "DONE"]) {
      expect(screen.getByText(col)).toBeInTheDocument();
    }
    expect(screen.queryByText("IN REVIEW")).not.toBeInTheDocument();
  });

  it("shows agent, model and Verify rounds from the trail", async () => {
    renderSubtasks();
    expect(await screen.findByText("implementer · sonnet")).toBeInTheDocument();
    expect(screen.getByText("r1 ✓")).toBeInTheDocument();
    expect(screen.getByText("r2 ✗")).toBeInTheDocument();
  });

  it("marks the Subtask the Run stopped on", async () => {
    renderSubtasks();
    await screen.findByText("Signature block");
    expect(screen.getAllByText("stopped")).toHaveLength(1);
  });

  it("is read-only while building and opens no panel on click", async () => {
    renderSubtasks();
    fireEvent.click(await screen.findByText("Template layout"));
    expect(useUiStore.getState().selectedTaskId).toBeNull();
    expect(screen.getByText("Read-only while the Story is building.")).toBeInTheDocument();
    expect(screen.getByText("Template layout").closest("[aria-disabled]")).toHaveAttribute("aria-disabled", "true");
  });

  it("is draggable outside building", async () => {
    renderSubtasks({ ...story, status: "integrated_tests", run_stopped: false });
    await screen.findByText("Template layout");
    expect(screen.queryByText("Read-only while the Story is building.")).not.toBeInTheDocument();
    expect(screen.getByText("Template layout").closest("[aria-disabled]")).toHaveAttribute("aria-disabled", "false");
    expect(screen.queryByText("stopped")).not.toBeInTheDocument();
  });
});
