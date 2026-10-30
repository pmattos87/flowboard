import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { EpicPage } from "@/features/story/EpicPage";
import { epicProgress } from "@/lib/epicProgress";
import type { Project, Task } from "@/types";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockInvoke = vi.mocked(invoke);

const factoryProject: Project = {
  id: 1, name: "Flowboard", key: "FB", description: "", color: "#6366f1",
  created_at: "", logo_data: null, position: 0, ladder: "factory", kind: "internal",
};

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

const epic = task({ id: 20, task_number: 20, type: "epic", status: "todo", title: "Hosted web app" });
const stories = [
  task({ id: 21, task_number: 21, epic_id: 20, status: "building", title: "Auth shell", story_points: 3 }),
  task({ id: 22, task_number: 22, epic_id: 20, status: "tested", title: "Sync API", sprint_id: 4, story_points: 5 }),
  task({ id: 23, task_number: 23, epic_id: 20, status: "done", title: "Static build" }),
  task({ id: 24, task_number: 24, epic_id: 20, status: "backlog", title: "Billing", story_points: 2 }),
  task({ id: 25, task_number: 25, epic_id: 20, status: "canceled", title: "Offline mode" }),
];
const others = [
  task({ id: 30, task_number: 30, status: "building", title: "Unrelated Story" }),
  task({ id: 31, task_number: 31, parent_id: 21, type: "subtask", status: "todo", title: "Auth subtask" }),
  task({ id: 32, task_number: 32, status: "ready", title: "Plain Story" }),
];

function setup(project: Project = factoryProject, epicRow: Task = epic) {
  const tasks = [epicRow, ...stories, ...others];
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "list_projects") return Promise.resolve([project]);
    if (cmd === "list_tasks") return Promise.resolve(tasks);
    if (cmd === "update_task") return Promise.resolve(epicRow);
    return Promise.resolve([]);
  });
  return tasks;
}

function renderPage(key = "FB-20") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/epic/${key}`]}>
        <Routes>
          <Route path="/epic/:key" element={<EpicPage />} />
          <Route path="/story/:key" element={<p>story page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("EpicPage", () => {
  it("lists the epic's Stories with their stage and the derived progress", async () => {
    const tasks = setup();
    renderPage();
    expect(await screen.findByDisplayValue("Hosted web app")).toBeInTheDocument();

    const list = screen.getByRole("list", { name: "Stories" });
    const rows: [string, string][] = [
      ["FB-21", "Building"], ["FB-22", "Tested"], ["FB-23", "Done"], ["FB-24", "Backlog"], ["FB-25", "Canceled"],
    ];
    for (const [key, stage] of rows) {
      const row = within(list).getByRole("link", { name: new RegExp(key) });
      expect(within(row).getByText(key)).toBeInTheDocument();
      expect(within(row).getByText(stage)).toBeInTheDocument();
    }
    expect(within(list).getAllByRole("link")).toHaveLength(rows.length);
    expect(within(list).queryByText("Unrelated Story")).not.toBeInTheDocument();
    expect(within(list).queryByText("Auth subtask")).not.toBeInTheDocument();

    const p = epicProgress(20, tasks);
    expect(`${p.tested}/${p.total}`).toBe("2/4");
    const progress = screen.getByRole("region", { name: "Progress" });
    expect(within(progress).getByText(`${p.tested}/${p.total}`)).toBeInTheDocument();
  });

  it("lists a bug Story of the epic and leaves out another epic's Story (QA)", async () => {
    const otherEpic = task({ id: 40, task_number: 40, type: "epic", status: "todo", title: "Other epic" });
    const bugStory = task({ id: 41, task_number: 41, type: "bug", epic_id: 20, status: "tested", title: "Bug Story" });
    const foreign = task({ id: 42, task_number: 42, epic_id: 40, status: "tested", title: "Foreign Story" });
    const bugSubtask = task({ id: 43, task_number: 43, type: "bug", parent_id: 21, epic_id: 20, status: "todo", title: "Bug subtask" });
    const tasks = [epic, ...stories, ...others, otherEpic, bugStory, foreign, bugSubtask];
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_projects") return Promise.resolve([factoryProject]);
      if (cmd === "list_tasks") return Promise.resolve(tasks);
      return Promise.resolve([]);
    });
    renderPage();
    const list = await screen.findByRole("list", { name: "Stories" });
    expect(within(list).getByText("Bug Story")).toBeInTheDocument();
    expect(within(list).queryByText("Foreign Story")).not.toBeInTheDocument();
    expect(within(list).queryByText("Bug subtask")).not.toBeInTheDocument();
    expect(within(list).queryByText("Other epic")).not.toBeInTheDocument();
    const p = epicProgress(20, tasks);
    expect(`${p.tested}/${p.total}`).toBe("3/5");
    const progress = screen.getByRole("region", { name: "Progress" });
    expect(within(progress).getByText("3/5")).toBeInTheDocument();
  });

  it("links each Story row to its Story page", async () => {
    setup();
    renderPage();
    await userEvent.click(await screen.findByRole("link", { name: /FB-22/ }));
    expect(await screen.findByText("story page")).toBeInTheDocument();
  });

  it("closes the epic with status done", async () => {
    setup();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_task", { id: 20, payload: { status: "done" } }),
    );
  });

  it("cancels the epic with status canceled", async () => {
    setup();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_task", { id: 20, payload: { status: "canceled" } }),
    );
  });

  it.each(["done", "canceled"] as const)("shows no lifecycle control on a %s epic", async (status) => {
    setup(factoryProject, { ...epic, status });
    renderPage();
    expect(await screen.findByDisplayValue("Hosted web app")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("has no Subtasks, Run or PR sections", async () => {
    setup();
    renderPage();
    expect(await screen.findByDisplayValue("Hosted web app")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /subtasks/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /run/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^PR$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /links/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/feature branch/i)).not.toBeInTheDocument();
  });

  it("says a non-epic key is not an epic", async () => {
    setup();
    renderPage("FB-21");
    expect(await screen.findByText("FB-21 is not an epic.")).toBeInTheDocument();
  });

  it("refuses a legacy project's epic", async () => {
    setup({ ...factoryProject, ladder: "legacy" });
    renderPage();
    expect(await screen.findByText("Flowboard is not a Factory project.")).toBeInTheDocument();
  });
});
