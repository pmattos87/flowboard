import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { DiscoveryBoard } from "@/features/boards/DiscoveryBoard";
import { useUiStore } from "@/stores/uiStore";
import type { Project, Task } from "@/types";

// FB-224: the Factory Discovery board grouped by epic.

const mockInvoke = vi.mocked(invoke);

function task(over: Partial<Task>): Task {
  return {
    id: 1, project_id: 1, task_number: 1, sprint_id: null, parent_id: null,
    title: "", description: "", type: "story", status: "backlog", priority: "medium",
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

const tasks = [
  task({ id: 10, task_number: 10, type: "epic", status: "todo", title: "Hosted web app" }),
  task({ id: 1, task_number: 1, epic_id: 10, title: "Drag me", story_points: 3 }),
  task({ id: 2, task_number: 2, epic_id: 10, sprint_id: 7, status: "tested", title: "Scheduled story", story_points: 5 }),
  task({ id: 3, task_number: 3, title: "Loose story" }),
];

function setup(ladder: Project["ladder"]) {
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "get_project") return Promise.resolve(project(ladder));
    if (cmd === "list_tasks") return Promise.resolve(tasks);
    if (cmd === "update_task") return Promise.resolve(tasks[1]);
    return Promise.resolve([]);
  });
}

function renderBoard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DiscoveryBoard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function row(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({ activeProjectId: 1, selectedTaskId: null, discoveryGrouping: "none" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Factory Discovery board grouping", () => {
  it("never shows an epic as a card in the ungrouped view", async () => {
    setup("factory");
    renderBoard();
    await screen.findByText("Drag me");
    expect(screen.queryByText("Hosted web app")).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("switches between grouped and ungrouped with the toggle", async () => {
    setup("factory");
    renderBoard();
    await screen.findByText("Drag me");
    expect(screen.getByRole("button", { name: "No grouping" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Group by epic" }));
    expect(useUiStore.getState().discoveryGrouping).toBe("epic");
    expect(within(row("Hosted web app")).getByText("Drag me")).toBeInTheDocument();
    expect(within(row("No epic")).getByText("Loose story")).toBeInTheDocument();
    expect(within(row("Hosted web app")).getByRole("link", { name: /FB-10/ })).toHaveAttribute("href", "/epic/FB-10");

    fireEvent.click(screen.getByRole("button", { name: "No grouping" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByText("Drag me")).toBeInTheDocument();
  });

  it("hides a row's cards when it is collapsed", async () => {
    useUiStore.setState({ discoveryGrouping: "epic" });
    setup("factory");
    renderBoard();
    await screen.findByText("Drag me");
    const toggle = screen.getByRole("button", { name: "Collapse FB-10" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(screen.queryByText("Drag me")).not.toBeInTheDocument();
    expect(screen.getByText("Loose story")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand FB-10" }));
    expect(screen.getByText("Drag me")).toBeInTheDocument();
  });

  it("counts a scheduled Story of the epic in the row's progress", async () => {
    useUiStore.setState({ discoveryGrouping: "epic" });
    setup("factory");
    renderBoard();
    await screen.findByText("Drag me");
    const header = within(row("Hosted web app")).getByTestId("epic-progress");
    // The scheduled Story is tested and not on the board, yet counts: 1/2 tested.
    expect(header).toHaveTextContent("1/2");
    expect(header).toHaveTextContent("tested");
    // Points left: the backlog Story (3) and the tested scheduled one (5).
    expect(header).toHaveTextContent("8 pts left");
    expect(screen.queryByText("Scheduled story")).not.toBeInTheDocument();
  });
});

describe("legacy Discovery board", () => {
  it("renders no grouping toggle", async () => {
    useUiStore.setState({ discoveryGrouping: "epic" });
    setup("legacy");
    renderBoard();
    await screen.findByText("Hosted web app");
    expect(screen.queryByRole("button", { name: "Group by epic" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

// Drop zones get deterministic rects: columns by header, rows stacked by section.
const COLUMN_X: Record<string, number> = { BACKLOG: 0, REFINING: 300, CANCELED: 600, READY: 900 };
const ROW_Y: Record<string, number> = { "Hosted web app": 0, "No epic": 500 };

function stubBoundingRects() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    const cls = el.className || "";
    if (typeof cls === "string" && cls.includes("min-h-[120px]")) {
      const header = el.parentElement?.querySelector("span.uppercase")?.textContent ?? "";
      const rowName = el.closest("section")?.getAttribute("aria-label") ?? "";
      const x = COLUMN_X[header] ?? 0;
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

describe("Factory Discovery board grouped drag and drop", () => {
  it("moves a card between columns of its own row", async () => {
    useUiStore.setState({ discoveryGrouping: "epic" });
    setup("factory");
    stubBoundingRects();
    renderBoard();
    const card = (await screen.findByText("Drag me")).closest("div") as HTMLElement;

    drag(card, dropZone("Hosted web app", "REFINING"), { x: 350, y: 40 });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "update_task",
        expect.objectContaining({ id: 1, payload: expect.objectContaining({ status: "refining" }) }),
      );
    });
  });

  it("invokes nothing when the card is dropped in another row's column", async () => {
    useUiStore.setState({ discoveryGrouping: "epic" });
    setup("factory");
    stubBoundingRects();
    renderBoard();
    const card = (await screen.findByText("Drag me")).closest("div") as HTMLElement;

    // Into the No epic row's READY column: no drop zone of the card's own row is there.
    drag(card, dropZone("No epic", "READY"), { x: 950, y: 640 });
    // The drag did start: its DragOverlay clone is up until the drop settles.
    expect(screen.getAllByText("Drag me")).toHaveLength(2);
    await waitFor(() => expect(screen.getAllByText("Drag me")).toHaveLength(1));
    // Then back into its own row, so waitFor proves the drag machinery ran.
    drag(screen.getByText("Drag me").closest("div") as HTMLElement, dropZone("Hosted web app", "CANCELED"), { x: 650, y: 40 });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "update_task",
        expect.objectContaining({ id: 1, payload: expect.objectContaining({ status: "canceled" }) }),
      );
    });
    // The cross-row drop came first and invoked nothing.
    expect(mockInvoke.mock.calls.filter(([cmd]) => cmd === "update_task")).toHaveLength(1);
  });
});
