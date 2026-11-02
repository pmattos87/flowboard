import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { UserStoryBoard } from "@/features/boards/UserStoryBoard";
import { useUiStore } from "@/stores/uiStore";
import type { BlockedByMap, Project, Task } from "@/types";

// FB-219: a blocked Story's card shows "Blocked by FB-x", each key a link to that Story's page.

const mockInvoke = vi.mocked(invoke);

function task(over: Partial<Task>): Task {
  return {
    id: 1, project_id: 1, task_number: 1, sprint_id: 7, parent_id: null,
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
    logo_data: null, position: 0, ladder, client_id: null, kind: "internal",
  };
}

const tasks = [
  task({ id: 1, task_number: 1, title: "Blocked story", status: "ready" }),
  task({ id: 2, task_number: 2, title: "Free story", status: "ready" }),
  task({ id: 5, task_number: 5, title: "Blocker one", status: "building" }),
  task({ id: 6, task_number: 6, title: "Blocker two", status: "building" }),
];

const blocked: BlockedByMap = { "FB-1": ["FB-5", "FB-6"] };

function setup(ladder: Project["ladder"], rows: Task[] = tasks) {
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "get_project") return Promise.resolve(project(ladder));
    if (cmd === "list_projects") return Promise.resolve([project(ladder)]);
    if (cmd === "list_tasks") return Promise.resolve(rows);
    if (cmd === "get_blocked_by") return Promise.resolve(blocked);
    return Promise.resolve([]);
  });
  useUiStore.setState({ activeProjectId: 1, selectedTaskId: null, boardSprintFilter: "all", boardSprintFilterFor: 1 });
}

function StoryRoute() {
  const { key } = useParams();
  return <p>story page {key}</p>;
}

function renderBoard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/board"]}>
        <Routes>
          <Route path="/board" element={<UserStoryBoard />} />
          <Route path="/story/:key" element={<StoryRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function stubRects() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ x: 0, y: 0, width: 200, height: 80, top: 0, right: 200, bottom: 80, left: 0, toJSON: () => ({}) }) as DOMRect,
  );
}

function drag(el: HTMLElement) {
  fireEvent.pointerDown(el, { clientX: 50, clientY: 40, pointerId: 1, button: 0, isPrimary: true });
  fireEvent.pointerMove(el, { clientX: 150, clientY: 40, pointerId: 1 });
  fireEvent.pointerMove(el, { clientX: 250, clientY: 140, pointerId: 1 });
}

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Blocked by on a Story card", () => {
  it("shows the marker with each key linking to its Story page, only on the blocked card", async () => {
    setup("factory");
    renderBoard();
    await screen.findByText("Free story");
    await screen.findByText("Blocked by");
    expect(screen.getAllByText("Blocked by")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "FB-5" })).toHaveAttribute("href", "/story/FB-5");
    expect(screen.getByRole("link", { name: "FB-6" })).toHaveAttribute("href", "/story/FB-6");
    expect(mockInvoke).toHaveBeenCalledWith("get_blocked_by", { projectKey: "FB" });

    const blockedCard = screen.getByText("Blocked story").closest("[aria-roledescription]") as HTMLElement;
    const freeCard = screen.getByText("Free story").closest("[aria-roledescription]") as HTMLElement;
    expect(blockedCard).toHaveTextContent("Blocked by");
    expect(freeCard).not.toHaveTextContent("Blocked by");
  });

  it("navigates on a key click without opening the card's own page or the panel", async () => {
    setup("factory");
    renderBoard();
    fireEvent.click(await screen.findByRole("link", { name: "FB-6" }));
    expect(await screen.findByText("story page FB-6")).toBeInTheDocument();
    expect(useUiStore.getState().selectedTaskId).toBeNull();
  });

  it("does not start a drag from a key, while the card itself still drags", async () => {
    setup("factory");
    stubRects();
    const { container } = renderBoard();
    const link = await screen.findByRole("link", { name: "FB-5" });
    drag(link);
    fireEvent.pointerUp(link, { clientX: 250, clientY: 140, pointerId: 1 });
    // The source slot turns into the dashed ghost only while a drag is under way.
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector(".border-dashed")).toBeNull();

    // Control: the same gesture on the card's title does start a drag.
    drag(screen.getByText("Blocked story"));
    await waitFor(() => expect(container.querySelector(".border-dashed")).not.toBeNull());
  });

  it("never asks a legacy project and shows no marker", async () => {
    // A legacy status, so the card has a column on the legacy board.
    setup("legacy", tasks.map((t) => ({ ...t, status: "todo" })));
    renderBoard();
    await screen.findByText("Blocked story");
    expect(screen.queryByText("Blocked by")).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("get_blocked_by", expect.anything());
  });
});
