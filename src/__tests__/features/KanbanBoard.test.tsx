import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KanbanBoard } from "@/features/boards/shared/KanbanBoard";
import { DISCOVERY_COLUMNS } from "@/features/boards/shared/boardConstants";
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

describe("KanbanBoard — discovery columns (FB-85)", () => {
  it("renders the discovery lifecycle columns when passed DISCOVERY_COLUMNS", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const discoveryStory: Task = {
      ...makeTasks()[2], id: 5, title: "Ready story", type: "story",
      status: "ready_for_development",
    };
    render(
      <QueryClientProvider client={qc}>
        <KanbanBoard tasks={[discoveryStory]} people={[]} projectKey="FB" columns={DISCOVERY_COLUMNS} />
      </QueryClientProvider>
    );
    expect(screen.getByText("TO DO")).toBeInTheDocument();
    expect(screen.getByText("REFINING")).toBeInTheDocument();
    expect(screen.getByText("CANCELED")).toBeInTheDocument();
    expect(screen.getByText("READY FOR DEVELOPMENT")).toBeInTheDocument();
    // The default workflow columns are absent on the discovery board.
    expect(screen.queryByText("IN PROGRESS")).not.toBeInTheDocument();
    expect(screen.queryByText("DONE")).not.toBeInTheDocument();
    // The ready story lands in its column.
    expect(screen.getByText("Ready story")).toBeInTheDocument();
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

describe("KanbanBoard — priority ordering (FB-10)", () => {
  const mixedPriorityTodos: Task[] = (["low", "critical", "medium", "high"] as const).map(
    (priority, i) => ({
      id: i + 1, project_id: 1, task_number: i + 1, sprint_id: null, parent_id: null,
      title: `${priority} card`, description: "", type: "task", status: "todo",
      priority, assignee_id: null, story_points: 1, due_date: null,
      created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
    })
  );

  it("orders cards within a column by priority, highest first", () => {
    renderBoard(mixedPriorityTodos);
    const order = ["critical card", "high card", "medium card", "low card"].map((t) =>
      screen.getByText(t)
    );
    for (let i = 0; i < order.length - 1; i++) {
      expect(
        order[i].compareDocumentPosition(order[i + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });
});
