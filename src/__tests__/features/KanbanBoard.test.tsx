import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KanbanBoard } from "@/features/boards/shared/KanbanBoard";
import { useUiStore } from "@/stores/uiStore";
import type { Task } from "@/types";

beforeEach(() => {
  useUiStore.setState({ selectedTaskId: null });
});

const makeTasks = (): Task[] => [
  {
    id: 1, project_id: 1, task_number: 1, sprint_id: null, parent_id: null,
    title: "Todo task", description: "", type: "task", status: "todo",
    priority: "low", assignee_id: null, story_points: 1, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
  {
    id: 2, project_id: 1, task_number: 1, sprint_id: null, parent_id: null,
    title: "In progress task", description: "", type: "bug", status: "in_progress",
    priority: "high", assignee_id: null, story_points: 2, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
  {
    id: 3, project_id: 1, task_number: 1, sprint_id: null, parent_id: null,
    title: "In review task", description: "", type: "story", status: "in_review",
    priority: "medium", assignee_id: null, story_points: 3, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
  {
    id: 4, project_id: 1, task_number: 1, sprint_id: null, parent_id: null,
    title: "Done task", description: "", type: "epic", status: "done",
    priority: "critical", assignee_id: null, story_points: 5, due_date: null,
    created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  },
];

function renderBoard(tasks = makeTasks()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <KanbanBoard tasks={tasks} people={[]} projectKey="FB" />
    </QueryClientProvider>
  );
}

describe("KanbanBoard — column headers", () => {
  it("renders all four column headers", () => {
    renderBoard();
    expect(screen.getByText("TO DO")).toBeInTheDocument();
    expect(screen.getByText("IN PROGRESS")).toBeInTheDocument();
    expect(screen.getByText("IN REVIEW")).toBeInTheDocument();
    expect(screen.getByText("DONE")).toBeInTheDocument();
  });
});

describe("KanbanBoard — task placement", () => {
  it("places each task in the correct column", () => {
    renderBoard();
    expect(screen.getByText("Todo task")).toBeInTheDocument();
    expect(screen.getByText("In progress task")).toBeInTheDocument();
    expect(screen.getByText("In review task")).toBeInTheDocument();
    expect(screen.getByText("Done task")).toBeInTheDocument();
  });

  it("shows task count per column", () => {
    renderBoard();
    const counts = screen.getAllByText("1");
    expect(counts.length).toBeGreaterThanOrEqual(4);
  });

  it("renders an empty column when no tasks have that status", () => {
    renderBoard([makeTasks()[0]]);
    expect(screen.getByText("Todo task")).toBeInTheDocument();
    expect(screen.queryByText("In progress task")).not.toBeInTheDocument();
  });
});
