import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import type { ReactElement } from "react";
import { TaskBoard } from "@/features/boards/TaskBoard";
import { UserStoryBoard } from "@/features/boards/UserStoryBoard";
import { SprintPlanningBoard } from "@/features/boards/SprintPlanningBoard";
import { DiscoveryBoard } from "@/features/boards/DiscoveryBoard";
import { useUiStore } from "@/stores/uiStore";
import type { Project, Sprint, Task } from "@/types";

// FB-216: the label filter on every board.

const mockInvoke = vi.mocked(invoke);

function task(over: Partial<Task>): Task {
  return {
    id: 1, project_id: 1, task_number: 1, sprint_id: null, parent_id: null,
    title: "", description: "", type: "story", status: "todo", priority: "medium",
    assignee_id: null, story_points: 0, due_date: null, created_at: "", updated_at: "",
    labels: "", feature_branch: null, review_verdict: null, reviewed_commit: null,
    findings_url: null, run_stopped: false, risk: false, release_id: null, epic_id: null,
    ...over,
  };
}

function project(id: number, ladder: Project["ladder"]): Project {
  return {
    id, name: `Project ${id}`, key: "FB", description: "", color: "#6366f1", created_at: "",
    logo_data: null, position: 0, ladder, client_id: null, kind: "internal", state: "active",
  };
}

const sprint: Sprint = {
  id: 7, project_id: 1, name: "Sprint 1", goal: "", status: "backlog",
  start_date: "2024-01-01", end_date: "2024-01-14",
};

/** Answers list_tasks per project, so each project only sees its own tasks. */
function setup(tasksByProject: Record<number, Task[]>, ladder: Project["ladder"] = "legacy") {
  mockInvoke.mockImplementation((cmd, args) => {
    const a = (args ?? {}) as { id?: number; filters?: { project_id?: number } | null };
    if (cmd === "list_tasks") return Promise.resolve(tasksByProject[a.filters?.project_id ?? -1] ?? []);
    if (cmd === "get_project") return Promise.resolve(project(a.id ?? 1, ladder));
    if (cmd === "list_sprints") return Promise.resolve([sprint]);
    return Promise.resolve([]);
  });
}

function renderBoard(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function chooseLabel(value: string) {
  fireEvent.change(screen.getByLabelText("Label filter"), { target: { value } });
}

/** Choosing "qa" leaves only the qa card; "All labels" brings the other back. */
async function expectFilterCycle(qaCard: string, otherCard: string) {
  await screen.findByText(qaCard);
  expect(screen.getByText(otherCard)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("option", { name: "qa" })).toBeInTheDocument());

  chooseLabel("qa");
  expect(screen.getByText(qaCard)).toBeInTheDocument();
  expect(screen.queryByText(otherCard)).not.toBeInTheDocument();

  chooseLabel("");
  expect(screen.getByText(qaCard)).toBeInTheDocument();
  expect(screen.getByText(otherCard)).toBeInTheDocument();
}

beforeEach(() => {
  mockInvoke.mockReset();
  useUiStore.setState({
    activeProjectId: 1,
    selectedTaskId: null,
    selectedSprintId: null,
    boardSprintFilter: "all",
    boardSprintFilterFor: 1,
    labelFilters: {},
    discoveryGrouping: "none",
  });
});

describe("Task Board label filter", () => {
  it("shows only the cards carrying the chosen label, then every card again", async () => {
    setup({
      1: [
        task({ id: 1, title: "Story row", labels: "ui" }),
        task({ id: 2, type: "subtask", title: "QA subtask", labels: "qa,tooling" }),
        task({ id: 3, type: "subtask", title: "UI subtask", labels: "ui" }),
      ],
    });
    renderBoard(<TaskBoard />);
    await screen.findByText("Unparented");
    fireEvent.click(screen.getByLabelText("Expand group"));
    await expectFilterCycle("QA subtask", "UI subtask");
    // The story is a row header, not a card: it stays while its cards are filtered.
    chooseLabel("qa");
    expect(screen.getByText("Story row")).toBeInTheDocument();
  });
});

describe("User Story Board label filter", () => {
  it("shows only the cards carrying the chosen label, then every card again", async () => {
    setup({
      1: [
        task({ id: 1, sprint_id: 7, title: "QA story", labels: "qa" }),
        task({ id: 2, sprint_id: 7, title: "UI story", labels: "ui" }),
      ],
    });
    renderBoard(<UserStoryBoard />);
    await expectFilterCycle("QA story", "UI story");
  });
});

describe("Sprint Planning Board label filter", () => {
  it("shows only the cards carrying the chosen label, then every card again", async () => {
    setup({
      1: [
        task({ id: 1, sprint_id: 7, title: "QA story", labels: "qa" }),
        task({ id: 2, sprint_id: 7, title: "UI story", labels: "ui" }),
      ],
    });
    renderBoard(<SprintPlanningBoard />);
    await expectFilterCycle("QA story", "UI story");
  });
});

describe("Discovery Board label filter", () => {
  it("shows only the cards carrying the chosen label, then every card again", async () => {
    setup({
      1: [
        task({ id: 1, title: "QA story", labels: "qa" }),
        task({ id: 2, title: "UI story", labels: "" }),
      ],
    });
    renderBoard(<DiscoveryBoard />);
    await expectFilterCycle("QA story", "UI story");
  });

  it("filters the cards of each epic row when grouped by epic", async () => {
    useUiStore.setState({ discoveryGrouping: "epic" });
    setup(
      {
        1: [
          task({ id: 10, type: "epic", title: "Hosted web app" }),
          task({ id: 1, status: "backlog", epic_id: 10, title: "QA story", labels: "qa" }),
          task({ id: 2, status: "backlog", epic_id: 10, title: "UI story", labels: "ui" }),
        ],
      },
      "factory",
    );
    renderBoard(<DiscoveryBoard />);
    await screen.findByRole("region", { name: "Hosted web app" });
    await expectFilterCycle("QA story", "UI story");
  });
});

describe("Label filter options", () => {
  it("lists only the active project's labels, and keeps each project's choice", async () => {
    setup({
      1: [task({ id: 1, sprint_id: 7, title: "QA story", labels: "qa,tooling" })],
      2: [task({ id: 2, project_id: 2, sprint_id: 7, title: "Other story", labels: "elsewhere" })],
    });
    renderBoard(<UserStoryBoard />);
    await waitFor(() => expect(screen.getByRole("option", { name: "tooling" })).toBeInTheDocument());
    const select = screen.getByLabelText("Label filter");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All labels",
      "qa",
      "tooling",
    ]);
    chooseLabel("qa");

    useUiStore.setState({ activeProjectId: 2 });
    await waitFor(() => expect(screen.getByRole("option", { name: "elsewhere" })).toBeInTheDocument());
    expect(screen.queryByRole("option", { name: "qa" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Label filter")).toHaveValue("");

    useUiStore.setState({ activeProjectId: 1 });
    await waitFor(() => expect(screen.getByLabelText("Label filter")).toHaveValue("qa"));
  });
});
