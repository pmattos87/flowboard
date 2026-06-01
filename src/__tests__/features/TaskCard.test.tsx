import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { TaskCard } from "@/features/boards/shared/TaskCard";
import { useUiStore } from "@/stores/uiStore";
import type { Person, Task } from "@/types";

beforeEach(() => {
  useUiStore.setState({ selectedTaskId: null });
});

const fakeTask: Task = {
  id: 42,
  project_id: 1,
  task_number: 1,
  sprint_id: null,
  parent_id: null,
  title: "Build kanban board",
  description: "",
  type: "task",
  status: "todo",
  priority: "high",
  assignee_id: 1,
  story_points: 5,
  due_date: null,
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
  labels: "frontend,ux",
};

const fakePerson: Person = {
  id: 1,
  name: "Alice",
  email: "alice@example.com",
  avatar_color: "#6366f1",
  role: "Dev",
};

function renderCard(task = fakeTask, people: Person[] = [fakePerson]) {
  return render(
    <DndContext onDragEnd={() => {}}>
      <TaskCard task={task} people={people} projectKey="FB" />
    </DndContext>
  );
}

describe("TaskCard — rendering", () => {
  it("renders the task title", () => {
    renderCard();
    expect(screen.getByText("Build kanban board")).toBeInTheDocument();
  });

  it("renders the ticket ID from per-project task_number, not internal id", () => {
    renderCard();
    expect(screen.getByText("FB-1")).toBeInTheDocument();
    expect(screen.queryByText("FB-42")).not.toBeInTheDocument();
  });

  it("renders story points", () => {
    renderCard();
    expect(screen.getByText("5pts")).toBeInTheDocument();
  });

  it("renders label badges from comma-separated string", () => {
    renderCard();
    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.getByText("ux")).toBeInTheDocument();
  });

  it("renders no label badges when labels is empty", () => {
    renderCard({ ...fakeTask, labels: "" });
    expect(screen.queryByText("frontend")).not.toBeInTheDocument();
  });

  it("renders assignee initial when assignee exists", () => {
    renderCard();
    expect(screen.getByTitle("Alice")).toBeInTheDocument();
    expect(screen.getByTitle("Alice")).toHaveTextContent("A");
  });

  it("renders placeholder avatar when assignee_id is null", () => {
    renderCard({ ...fakeTask, assignee_id: null });
    expect(screen.queryByTitle("Alice")).not.toBeInTheDocument();
  });
});

describe("TaskCard — click to open detail", () => {
  it("calls setSelectedTaskId on click", () => {
    const { container } = renderCard();
    const card = container.firstChild as HTMLElement;
    fireEvent.click(card);
    expect(useUiStore.getState().selectedTaskId).toBe(42);
  });
});
