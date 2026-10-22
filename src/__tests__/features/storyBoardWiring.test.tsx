import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { UserStoryBoard } from "@/features/boards/UserStoryBoard";
import { DiscoveryBoard } from "@/features/boards/DiscoveryBoard";
import { Sidebar } from "@/components/Sidebar";
import { openBugCount, storyPagePath } from "@/features/story/useStoryCardDecor";
import { useUiStore } from "@/stores/uiStore";
import type { Project, Task } from "@/types";

const mockInvoke = vi.mocked(invoke);

function task(over: Partial<Task>): Task {
  return {
    id: 1, project_id: 1, task_number: 1, sprint_id: 7, parent_id: null,
    title: "", description: "", type: "story", status: "ready", priority: "medium",
    assignee_id: null, story_points: 0, due_date: null, created_at: "", updated_at: "",
    labels: "", feature_branch: null, review_verdict: null, reviewed_commit: null,
    findings_url: null, run_stopped: false, risk: false, release_id: null,
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
  task({ id: 1, task_number: 1, title: "Stopped story", status: "building", run_stopped: true }),
  task({ id: 2, task_number: 2, parent_id: 1, type: "bug", status: "todo", title: "Bug a" }),
  task({ id: 3, task_number: 3, parent_id: 1, type: "bug", status: "done", title: "Bug b" }),
  task({ id: 4, task_number: 4, parent_id: 1, type: "task", status: "todo", title: "Task c" }),
  task({ id: 5, task_number: 5, title: "Dropped story", status: "canceled" }),
  task({ id: 6, task_number: 6, sprint_id: null, title: "Canceled idea", status: "canceled" }),
];

function setup(ladder: Project["ladder"]) {
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "get_project") return Promise.resolve(project(ladder));
    if (cmd === "list_projects") return Promise.resolve([project(ladder)]);
    if (cmd === "list_tasks") return Promise.resolve(tasks);
    return Promise.resolve([]);
  });
  useUiStore.setState({ activeProjectId: 1, selectedTaskId: null, boardSprintFilter: "all", boardSprintFilterFor: 1 });
}

function renderAt(element: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/board"]}>
        <Routes>
          <Route path="/board" element={element} />
          <Route path="/story/:key" element={<p>story page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("storyPagePath and openBugCount", () => {
  it("routes only Factory Stories to the Story page", () => {
    expect(storyPagePath(project("factory"), tasks[0])).toBe("/story/FB-1");
    expect(storyPagePath(project("factory"), tasks[1])).toBeNull();
    expect(storyPagePath(project("legacy"), tasks[0])).toBeNull();
  });

  it("counts open bug Subtasks only", () => {
    expect(openBugCount(tasks[0], tasks)).toBe(1);
  });
});

describe("Factory Story board", () => {
  it("shows the Run flags and opens the Story page on click", async () => {
    setup("factory");
    renderAt(<UserStoryBoard />);
    expect(await screen.findByText("stopped")).toBeInTheDocument();
    expect(screen.getByText("waiting on 1 bug")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Stopped story"));
    expect(await screen.findByText("story page")).toBeInTheDocument();
    expect(useUiStore.getState().selectedTaskId).toBeNull();
  });

  it("hides canceled Stories until Show canceled is ticked", async () => {
    setup("factory");
    renderAt(<UserStoryBoard />);
    await screen.findByText("Stopped story");
    expect(screen.queryByText("Dropped story")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Show canceled"));
    expect(await screen.findByText("Dropped story")).toBeInTheDocument();
  });

  it("hides canceled on the Discovery board too", async () => {
    setup("factory");
    renderAt(<DiscoveryBoard />);
    await screen.findByText("Discovery Board");
    await waitFor(() => expect(screen.getByLabelText("Show canceled")).toBeInTheDocument());
    expect(screen.queryByText("Canceled idea")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Show canceled"));
    expect(await screen.findByText("Canceled idea")).toBeInTheDocument();
  });
});

describe("legacy Story board", () => {
  it("keeps the slide-over, the CANCELED column and no flags", async () => {
    setup("legacy");
    renderAt(<UserStoryBoard />);
    await screen.findByText("User Story Board");
    await waitFor(() => expect(screen.getByText("CANCELED")).toBeInTheDocument());
    expect(screen.queryByLabelText("Show canceled")).not.toBeInTheDocument();
    expect(screen.queryByText("stopped")).not.toBeInTheDocument();
  });
});

describe("Sidebar", () => {
  it("hides the Task Board on a Factory project only", async () => {
    setup("factory");
    const { unmount } = renderAt(<Sidebar />);
    await screen.findByText("Flowboard");
    expect(screen.queryByText("Task Board")).not.toBeInTheDocument();
    unmount();
    setup("legacy");
    renderAt(<Sidebar />);
    expect(await screen.findByText("Task Board")).toBeInTheDocument();
  });
});
