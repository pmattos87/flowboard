/**
 * Regression test for the DnD lifecycle bug fixed on phase/5-boards.
 *
 * The bug: KanbanColumn (and SprintPlanningBoard.DroppablePanel) used to swap the
 * dragged TaskCard for a placeholder <div> while it was being dragged. That
 * unmounted the source TaskCard's `useDraggable`, clearing its `data.current = { task }`
 * registration mid-drag. On drop, `active.data.current` was undefined, so the handler
 * aborted before invoking `update_task` — the card visually vanished and the DB never
 * updated.
 *
 * The fix: TaskCard now renders the dashed placeholder *inside* the same `setNodeRef`
 * element when `useDraggable().isDragging` is true. KanbanColumn and DroppablePanel
 * always render <TaskCard>. The draggable stays mounted with `data.current` intact
 * for the full drag lifecycle.
 *
 * The load-bearing assertion below is that `invoke("update_task", ...)` fires with
 * the correct payload after a cross-column drag. If a future refactor reintroduces the
 * unmount-during-drag anti-pattern, `active.data.current` will be undefined at drop
 * and the assertion will fail.
 *
 * NOTE on jsdom: @dnd-kit's PointerSensor uses `getBoundingClientRect()` for collision
 * detection, and jsdom returns all-zero rects by default. The mock below assigns
 * deterministic, distinct rects per droppable column so the sensor can resolve which
 * column the pointer is over at drop time. If this test flakes on a future @dnd-kit
 * upgrade, revisit the rect mock first.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { KanbanBoard } from "@/features/boards/shared/KanbanBoard";
import { useUiStore } from "@/stores/uiStore";
import type { Task } from "@/types";

const mockInvoke = vi.mocked(invoke);

const todoTask: Task = {
  id: 42, project_id: 1, sprint_id: null, parent_id: null,
  title: "Drag me", description: "", type: "task", status: "todo",
  priority: "medium", assignee_id: null, story_points: 1, due_date: null,
  created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
};

function renderBoard(tasks: Task[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <KanbanBoard tasks={tasks} people={[]} projectKey="FB" />
    </QueryClientProvider>
  );
}

// Map column status → x-offset so each droppable has a deterministic rect.
const COLUMN_X: Record<string, number> = {
  todo: 0,
  in_progress: 300,
  in_review: 600,
  done: 900,
};

function stubBoundingRects() {
  // Assign a non-zero rect to every element so @dnd-kit collision detection works.
  // For each KanbanColumn drop-zone (identified by min-h-[120px] in the class), use
  // a column-specific x offset keyed off the column header text in its ancestor.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    const cls = el.className || "";

    // Drop-zone elements
    if (typeof cls === "string" && cls.includes("min-h-[120px]")) {
      const headerText = el.parentElement?.querySelector("span.uppercase")?.textContent ?? "";
      const status =
        headerText === "TO DO" ? "todo" :
        headerText === "IN PROGRESS" ? "in_progress" :
        headerText === "IN REVIEW" ? "in_review" :
        headerText === "DONE" ? "done" : "todo";
      const x = COLUMN_X[status];
      return {
        x, y: 0, width: 250, height: 400,
        top: 0, right: x + 250, bottom: 400, left: x,
        toJSON: () => ({}),
      } as DOMRect;
    }

    // TaskCard (and other elements) — give a small non-zero rect.
    return {
      x: 0, y: 0, width: 200, height: 80,
      top: 0, right: 200, bottom: 80, left: 0,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({ selectedTaskId: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("KanbanBoard — DnD lifecycle regression", () => {
  it("invokes update_task with the new status after a cross-column drag", async () => {
    mockInvoke.mockResolvedValue({ ...todoTask, status: "in_progress" });
    stubBoundingRects();

    renderBoard([todoTask]);

    const card = screen.getByText("Drag me").closest("div") as HTMLElement;
    // Drop zone for the "In Progress" column: drop-zone div inside the column whose
    // header text reads "IN PROGRESS".
    const inProgressHeader = screen.getByText("IN PROGRESS");
    const inProgressDropZone = inProgressHeader
      .closest("div.flex.flex-col")!
      .querySelector("[class*='min-h-']") as HTMLElement;

    // PointerSensor has activationConstraint: { distance: 5 } — move > 5px before release.
    fireEvent.pointerDown(card, { clientX: 50, clientY: 40, pointerId: 1, button: 0 });
    fireEvent.pointerMove(card, { clientX: 150, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(inProgressDropZone, { clientX: 400, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(inProgressDropZone, { clientX: 400, clientY: 200, pointerId: 1 });

    expect(mockInvoke).toHaveBeenCalledWith(
      "update_task",
      expect.objectContaining({
        id: 42,
        payload: expect.objectContaining({ status: "in_progress" }),
      })
    );
  });

  it("does not invoke update_task when the card is dropped back on its own column", async () => {
    stubBoundingRects();
    renderBoard([todoTask]);

    const card = screen.getByText("Drag me").closest("div") as HTMLElement;
    const todoDropZone = screen.getByText("TO DO")
      .closest("div.flex.flex-col")!
      .querySelector("[class*='min-h-']") as HTMLElement;

    fireEvent.pointerDown(card, { clientX: 50, clientY: 40, pointerId: 1, button: 0 });
    fireEvent.pointerMove(card, { clientX: 100, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(todoDropZone, { clientX: 100, clientY: 200, pointerId: 1 });

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "update_task",
      expect.anything()
    );
  });
});
