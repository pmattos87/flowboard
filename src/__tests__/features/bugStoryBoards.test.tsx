import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { DiscoveryBoard } from "@/features/boards/DiscoveryBoard";
import { UserStoryBoard } from "@/features/boards/UserStoryBoard";
import { SprintPlanningBoard } from "@/features/boards/SprintPlanningBoard";
import { TaskBoard } from "@/features/boards/TaskBoard";
import { StoryPage } from "@/features/story/StoryPage";
import { StorySubtasks } from "@/features/story/StorySubtasks";
import { useUiStore } from "@/stores/uiStore";
import type { Project, StoryView, Task } from "@/types";

// FB-52: a top-level bug on a Factory project is a Story and must render on every
// Story board. KanbanBoard drops a row whose status matches no column without an
// error (LESSONS.md), so each test pins the column or row the bug Story lands in.

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }));

const mockInvoke = vi.mocked(invoke);

function task(over: Partial<Task>): Task {
  return {
    id: 1, project_id: 1, task_number: 1, sprint_id: null, parent_id: null,
    title: "", description: "", type: "bug", status: "backlog", priority: "medium",
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

const sprints = [
  { id: 7, project_id: 1, name: "Sprint 7", goal: "", status: "backlog", start_date: "2024-01-01", end_date: "2024-01-14" },
];

function setup(ladder: Project["ladder"], tasks: Task[], view?: StoryView) {
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "get_project") return Promise.resolve(project(ladder));
    if (cmd === "list_projects") return Promise.resolve([project(ladder)]);
    if (cmd === "list_tasks") return Promise.resolve(tasks);
    if (cmd === "list_sprints") return Promise.resolve(sprints);
    if (cmd === "get_story") return Promise.resolve(view ?? null);
    return Promise.resolve([]);
  });
  useUiStore.setState({ activeProjectId: 1, selectedTaskId: null, boardSprintFilter: "all", boardSprintFilterFor: 1 });
}

function renderAt(element: React.ReactNode, path = "/board", route = "/board") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The Kanban column a card sits in, by its header label. */
function columnOf(cardText: string): HTMLElement {
  return screen.getByText(cardText).closest(".min-w-\\[240px\\]") as HTMLElement;
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("a Factory bug Story on the Story boards", () => {
  it("renders at backlog in the Discovery BACKLOG column", async () => {
    setup("factory", [task({ title: "Crash on save", status: "backlog" })]);
    renderAt(<DiscoveryBoard />);
    await screen.findByText("Crash on save");
    expect(within(columnOf("Crash on save")).getByText("BACKLOG")).toBeInTheDocument();
  });

  it("renders at ready with no sprint in the Sprint Planning backlog row", async () => {
    setup("factory", [task({ title: "Crash on save", status: "ready" })]);
    renderAt(<SprintPlanningBoard />);
    await screen.findByText("Crash on save");
    const row = screen.getByText("Ready for Development").closest("div.rounded-lg") as HTMLElement;
    expect(within(row).getByText("Crash on save")).toBeInTheDocument();
  });

  it("renders in a sprint at building in the User Story Board BUILDING column", async () => {
    setup("factory", [task({ title: "Crash on save", status: "building", sprint_id: 7 })]);
    renderAt(<UserStoryBoard />);
    await screen.findByText("Crash on save");
    expect(within(columnOf("Crash on save")).getByText("BUILDING")).toBeInTheDocument();
  });

  it("keeps a bug Subtask off the User Story Board", async () => {
    setup("factory", [
      task({ id: 1, title: "Parent story", type: "story", status: "building", sprint_id: 7 }),
      task({ id: 2, title: "Child bug", parent_id: 1, status: "todo", sprint_id: 7 }),
    ]);
    renderAt(<UserStoryBoard />);
    await screen.findByText("Parent story");
    expect(screen.queryByText("Child bug")).not.toBeInTheDocument();
  });
});

// Review B2: on a Factory project the Task Board redirects to the User Story
// Board (SF-61), and a Story's children live on its Story page. This is the path
// a Factory bug Story and its Subtasks actually render on.
describe("the Factory Task Board path with a bug Story", () => {
  const bugStory = task({ id: 1, task_number: 1, title: "Crash on save", status: "building", sprint_id: 7 });
  const children = [
    task({ id: 2, task_number: 2, title: "Fix the writer", type: "subtask", parent_id: 1, status: "in_progress", sprint_id: 7 }),
    task({ id: 3, task_number: 3, title: "Found in testing", parent_id: 1, status: "todo", sprint_id: 7 }),
  ];

  it("redirects the Task Board to the User Story Board, where the bug Story is a card", async () => {
    setup("factory", [bugStory, ...children]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/board/task"]}>
          <Routes>
            <Route path="/board/task" element={<TaskBoard />} />
            <Route path="/board/user-story" element={<UserStoryBoard />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText("Crash on save");
    expect(screen.queryByText("Task Board")).not.toBeInTheDocument();
    expect(within(columnOf("Crash on save")).getByText("BUILDING")).toBeInTheDocument();
    expect(screen.queryByText("Fix the writer")).not.toBeInTheDocument();
    expect(screen.queryByText("Found in testing")).not.toBeInTheDocument();
  });

  it("renders the bug Story's Subtask and bug Subtask on its Story page board", async () => {
    setup("factory", [bugStory, ...children]);
    renderAt(<StorySubtasks story={bugStory} storyKey="FB-1" projectKey="FB" />);
    await screen.findByText("Fix the writer");
    expect(within(columnOf("Fix the writer")).getByText("IN PROGRESS")).toBeInTheDocument();
    expect(within(columnOf("Found in testing")).getByText("TO DO")).toBeInTheDocument();
    expect(screen.queryByText("Crash on save")).not.toBeInTheDocument();
  });
});

describe("legacy top-level bug on the Task Board", () => {
  it("still appears in the Unparented row", async () => {
    setup("legacy", [task({ title: "Legacy bug", status: "todo" })]);
    renderAt(<TaskBoard />);
    // The Unparented row starts collapsed; its header counts the bug.
    const header = await screen.findByText("Unparented");
    expect(within(header.parentElement as HTMLElement).getByText("1 item")).toBeInTheDocument();
  });
});

describe("StoryPage with a bug Story", () => {
  it("loads a Factory bug Story rather than 'is not a Story'", async () => {
    const view: StoryView = {
      key: "FB-9", title: "Crash on save", type: "bug", status: "building", priority: "medium", labels: "",
      assignee: "Pedro", sprint_id: 7, feature_branch: null,
      review: { verdict: null, commit: null, findings_url: null },
      release: null, epic: null, flags: { stopped: false, waiting_on_bugs: 0 },
      prs: [], depends_on: [], subtasks: [], description: "",
    };
    setup("factory", [task({ id: 3, task_number: 9, title: "Crash on save", status: "building", sprint_id: 7 })], view);
    renderAt(<StoryPage />, "/story/FB-9", "/story/:key");
    expect(await screen.findByText("FB-9")).toBeInTheDocument();
    expect(screen.queryByText(/is not a Story/)).not.toBeInTheDocument();
  });
});
