import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { UserStoryBoard } from "@/features/boards/UserStoryBoard";
import { useUiStore } from "@/stores/uiStore";
import type { Project, Sprint, Task } from "@/types";

// FB-291: the Factory User Story Board grouped by epic.

const mockInvoke = vi.mocked(invoke);

function task(over: Partial<Task>): Task {
  return {
    id: 1, project_id: 1, task_number: 1, sprint_id: null, parent_id: null,
    title: "", description: "", type: "story", status: "ready", priority: "medium",
    assignee_id: null, story_points: 0, due_date: null, created_at: "", updated_at: "",
    labels: "", feature_branch: null, review_verdict: null, reviewed_commit: null,
    findings_url: null, run_stopped: false, risk: false, release_id: null, epic_id: null,
    ...over,
  };
}

function project(ladder: Project["ladder"]): Project {
  return {
    id: 1, name: "Flowboard", key: "FB", description: "", color: "#6366f1", created_at: "",
    logo_data: null, position: 0, ladder, kind: "internal",
  };
}

// None is "active", so the sprint filter stays where each test puts it.
const sprints: Sprint[] = [
  { id: 7, project_id: 1, name: "Sprint 1", goal: "", status: "backlog", start_date: "2026-10-01", end_date: "2026-10-14" },
  { id: 8, project_id: 1, name: "Sprint 2", goal: "", status: "backlog", start_date: "2026-10-01", end_date: "2026-10-14" },
  { id: 9, project_id: 1, name: "Sprint 3", goal: "", status: "backlog", start_date: "2026-10-01", end_date: "2026-10-14" },
];

const allTasks = [
  task({ id: 10, task_number: 10, type: "epic", status: "todo", title: "Run graph" }),
  task({ id: 11, task_number: 11, type: "epic", status: "done", title: "Client projects" }),
  task({ id: 12, task_number: 12, type: "epic", status: "todo", title: "Idle epic" }),
  task({ id: 1, task_number: 1, epic_id: 10, sprint_id: 7, status: "ready", title: "Drag me" }),
  task({ id: 2, task_number: 2, epic_id: 10, sprint_id: 8, status: "tested", title: "Other sprint story" }),
  task({ id: 3, task_number: 3, epic_id: 10, status: "backlog", title: "Unscheduled story" }),
  task({ id: 4, task_number: 4, epic_id: 11, sprint_id: 7, status: "building", title: "Client story" }),
  task({ id: 5, task_number: 5, epic_id: 12, sprint_id: 8, status: "building", title: "Idle story" }),
  task({ id: 6, task_number: 6, sprint_id: 7, status: "ready", title: "Loose story" }),
];

function setup(ladder: Project["ladder"], tasks: Task[] = allTasks) {
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "get_project") return Promise.resolve(project(ladder));
    if (cmd === "list_tasks") return Promise.resolve(tasks);
    if (cmd === "list_sprints") return Promise.resolve(sprints);
    if (cmd === "update_task") return Promise.resolve(tasks[0]);
    return Promise.resolve([]);
  });
}

function renderBoard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UserStoryBoard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function row(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

function rowNames(): (string | null)[] {
  return screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({
    activeProjectId: 1,
    selectedTaskId: null,
    boardSprintFilter: 7,
    boardSprintFilterFor: 1,
    storyBoardGrouping: "none",
    discoveryGrouping: "none",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Factory User Story Board grouping toggle", () => {
  it("renders the toggle and stays ungrouped on No grouping", async () => {
    setup("factory");
    renderBoard();
    await screen.findByText("Drag me");
    const group = screen.getByRole("group", { name: "Grouping" });
    expect(within(group).getByRole("button", { name: "No grouping" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Group by epic" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByText("Client story")).toBeInTheDocument();
    expect(screen.getByText("Loose story")).toBeInTheDocument();
  });

  it("switches to the grouped view and back, leaving the Discovery flag alone", async () => {
    setup("factory");
    renderBoard();
    await screen.findByText("Drag me");

    fireEvent.click(screen.getByRole("button", { name: "Group by epic" }));
    expect(useUiStore.getState().storyBoardGrouping).toBe("epic");
    expect(useUiStore.getState().discoveryGrouping).toBe("none");
    expect(within(row("Run graph")).getByText("Drag me")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "No grouping" }));
    expect(useUiStore.getState().storyBoardGrouping).toBe("none");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByText("Drag me")).toBeInTheDocument();
  });
});

describe("Factory User Story Board grouped by epic", () => {
  beforeEach(() => {
    useUiStore.setState({ storyBoardGrouping: "epic" });
  });

  it("puts each card of the filtered sprint in exactly one row, No epic last", async () => {
    setup("factory");
    renderBoard();
    await screen.findByText("Drag me");

    // Idle epic holds only a Story of another sprint: no row.
    expect(rowNames()).toEqual(["Run graph", "Client projects", "No epic"]);
    for (const [title, rowName] of [["Drag me", "Run graph"], ["Client story", "Client projects"], ["Loose story", "No epic"]]) {
      expect(screen.getAllByText(title)).toHaveLength(1);
      expect(within(row(rowName)).getByText(title)).toBeInTheDocument();
    }
    expect(screen.queryByText("Other sprint story")).not.toBeInTheDocument();
    expect(screen.queryByText("Unscheduled story")).not.toBeInTheDocument();
    expect(screen.queryByText("Idle story")).not.toBeInTheDocument();
  });

  it("omits the No epic row when every card has an epic row", async () => {
    setup("factory", allTasks.filter((t) => t.id !== 6));
    renderBoard();
    await screen.findByText("Drag me");
    expect(rowNames()).toEqual(["Run graph", "Client projects"]);
  });

  it("shows the epic's title and counts its Stories outside the sprint in the progress", async () => {
    setup("factory");
    renderBoard();
    await screen.findByText("Drag me");
    expect(within(row("Run graph")).getByRole("link", { name: /FB-10/ })).toHaveTextContent("Run graph");
    // Of its three Stories only "Drag me" is on the board; the tested one in
    // Sprint 2 and the unscheduled one still count: 1/3 tested.
    const progress = within(row("Run graph")).getByTestId("epic-progress");
    expect(progress).toHaveTextContent("1/3");
    expect(progress).toHaveTextContent("tested");
  });

  it("hides a row's cards when it is collapsed and shows them again", async () => {
    setup("factory");
    renderBoard();
    await screen.findByText("Drag me");
    fireEvent.click(screen.getByRole("button", { name: "Collapse FB-10" }));
    expect(screen.queryByText("Drag me")).not.toBeInTheDocument();
    expect(screen.getByText("Loose story")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand FB-10" }));
    expect(screen.getByText("Drag me")).toBeInTheDocument();
  });

  it("shows the empty-sprint message when the filtered sprint holds no Stories", async () => {
    useUiStore.setState({ boardSprintFilter: 9 });
    setup("factory");
    renderBoard();
    expect(await screen.findByText("No stories in Sprint 3.")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

describe("legacy User Story Board", () => {
  it("renders no grouping toggle and stays ungrouped", async () => {
    useUiStore.setState({ storyBoardGrouping: "epic" });
    setup("legacy", allTasks.map((t) => (t.type === "story" ? { ...t, status: "todo" } : t)));
    renderBoard();
    await screen.findByText("Drag me");
    expect(screen.queryByRole("group", { name: "Grouping" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Group by epic" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByText("Loose story")).toBeInTheDocument();
  });
});

// Drop zones get deterministic rects: columns by header, rows stacked by section.
const COLUMN_X: Record<string, number> = { READY: 0, BUILDING: 300, "INTEGRATED TESTS": 600 };
const ROW_Y: Record<string, number> = { "Run graph": 0, "Client projects": 500, "No epic": 1000 };

function stubBoundingRects() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    const cls = el.className || "";
    if (typeof cls === "string" && cls.includes("min-h-[120px]")) {
      const header = el.parentElement?.querySelector("span.uppercase")?.textContent ?? "";
      const rowName = el.closest("section")?.getAttribute("aria-label") ?? "";
      const x = COLUMN_X[header] ?? 2000;
      const y = ROW_Y[rowName] ?? 0;
      return { x, y, width: 250, height: 400, top: y, right: x + 250, bottom: y + 400, left: x, toJSON: () => ({}) } as DOMRect;
    }
    return { x: 0, y: 0, width: 200, height: 80, top: 0, right: 200, bottom: 80, left: 0, toJSON: () => ({}) } as DOMRect;
  });
}

function drag(card: HTMLElement, target: HTMLElement, to: { x: number; y: number }) {
  // isPrimary: true, or @dnd-kit's PointerSensor never activates under jsdom.
  fireEvent.pointerDown(card, { clientX: 50, clientY: 40, pointerId: 1, button: 0, isPrimary: true });
  fireEvent.pointerMove(card, { clientX: 150, clientY: 40, pointerId: 1 });
  fireEvent.pointerMove(target, { clientX: to.x, clientY: to.y, pointerId: 1 });
  fireEvent.pointerUp(target, { clientX: to.x, clientY: to.y, pointerId: 1 });
}

function dropZone(rowName: string, column: string): HTMLElement {
  return within(row(rowName))
    .getByText(column)
    .closest("div.flex.flex-col")!
    .querySelector("[class*='min-h-']") as HTMLElement;
}

describe("Factory User Story Board grouped drag and drop", () => {
  beforeEach(() => {
    useUiStore.setState({ storyBoardGrouping: "epic" });
  });

  it("moves a card between columns of its own row", async () => {
    setup("factory");
    stubBoundingRects();
    renderBoard();
    const card = (await screen.findByText("Drag me")).closest("div") as HTMLElement;

    drag(card, dropZone("Run graph", "BUILDING"), { x: 350, y: 40 });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "update_task",
        expect.objectContaining({ id: 1, payload: expect.objectContaining({ status: "building" }) }),
      );
    });
  });

  it("invokes nothing when the card is dropped in another row's column", async () => {
    setup("factory");
    stubBoundingRects();
    renderBoard();
    const card = (await screen.findByText("Drag me")).closest("div") as HTMLElement;

    // Into the No epic row's BUILDING column: no drop zone of the card's own row is there.
    drag(card, dropZone("No epic", "BUILDING"), { x: 350, y: 1140 });
    // The drag did start: its DragOverlay clone is up until the drop settles.
    expect(screen.getAllByText("Drag me")).toHaveLength(2);
    await waitFor(() => expect(screen.getAllByText("Drag me")).toHaveLength(1));
    // Then back into its own row, so waitFor proves the drag machinery ran.
    drag(
      screen.getByText("Drag me").closest("div") as HTMLElement,
      dropZone("Run graph", "INTEGRATED TESTS"),
      { x: 650, y: 40 },
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "update_task",
        expect.objectContaining({ id: 1, payload: expect.objectContaining({ status: "integrated_tests" }) }),
      );
    });
    // The cross-row drop came first and invoked nothing.
    expect(mockInvoke.mock.calls.filter(([cmd]) => cmd === "update_task")).toHaveLength(1);
  });
});
