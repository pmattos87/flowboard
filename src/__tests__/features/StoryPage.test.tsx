import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { StoryPage } from "@/features/story/StoryPage";
import type { StoryView } from "@/types";
import { openUrl } from "@tauri-apps/plugin-opener";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockInvoke = vi.mocked(invoke);

const factoryProject = {
  id: 1, name: "Flowboard", key: "FB", description: "", color: "#6366f1",
  created_at: "", logo_data: null, position: 0, ladder: "factory", kind: "internal",
};

const storyTask = {
  id: 7, project_id: 1, task_number: 12, sprint_id: 3, parent_id: null,
  title: "Export contract", description: "Brief text", type: "story", status: "building",
  priority: "high", assignee_id: null, story_points: 5, due_date: null,
  created_at: "", updated_at: "", labels: "", feature_branch: "feat/FB-12-export",
  review_verdict: null, reviewed_commit: null, findings_url: null,
  run_stopped: true, risk: false, release_id: null,
};

function storyView(over: Partial<StoryView> = {}): StoryView {
  return {
    key: "FB-12", title: "Export contract", status: "building", priority: "high", labels: "",
    assignee: "Pedro", sprint_id: 3, feature_branch: "feat/FB-12-export",
    review: { verdict: null, commit: null, findings_url: null },
    release: null,
    flags: { stopped: true, waiting_on_bugs: 2 },
    prs: [],
    depends_on: ["FB-9"],
    subtasks: [],
    description: "Brief text",
    ...over,
  };
}

function setupInvoke(project = factoryProject, view = storyView()) {
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "list_projects") return Promise.resolve([project]);
    if (cmd === "get_project") return Promise.resolve(project);
    if (cmd === "list_tasks") return Promise.resolve([storyTask]);
    if (cmd === "get_story") return Promise.resolve(view);
    if (cmd === "get_story_trail")
      return Promise.resolve([
        { at: "", action: "run_stopped", old: "", new: { reason: "Verify failed twice on FB-14" }, by: "Claude" },
      ]);
    if (cmd === "restart_run") return Promise.resolve({ ...view, flags: { ...view.flags, stopped: false } });
    return Promise.resolve([]);
  });
}

function renderPage(key = "FB-12") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/story/${key}`]}>
        <Routes>
          <Route path="/story/:key" element={<StoryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("StoryPage", () => {
  it("shows the header, flags and links of a Factory Story", async () => {
    setupInvoke();
    renderPage();
    expect(await screen.findByDisplayValue("Export contract")).toBeInTheDocument();
    expect(screen.getByText("FB-12")).toBeInTheDocument();
    // The header flag, beside the graph legend's "stopped".
    expect(screen.getAllByText("stopped")).toHaveLength(2);
    expect(screen.getByText("waiting on 2 bugs")).toBeInTheDocument();
    expect(screen.getByText("feat/FB-12-export")).toBeInTheDocument();
    expect(screen.getByText("FB-9")).toBeInTheDocument();
    expect(screen.getByText("— not reviewed")).toBeInTheDocument();
  });

  it("shows the stop reason and restarts the Run", async () => {
    setupInvoke();
    renderPage();
    // In the stopped box, as the graph's Stop caption and in the trail.
    expect(await screen.findAllByText("Verify failed twice on FB-14")).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Restart Run" }));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("restart_run", { key: "FB-12" }));
  });

  it("has no stopped box when the Run is not stopped", async () => {
    setupInvoke(factoryProject, storyView({ flags: { stopped: false, waiting_on_bugs: 0 } }));
    renderPage();
    await screen.findByDisplayValue("Export contract");
    expect(screen.queryByRole("button", { name: "Restart Run" })).not.toBeInTheDocument();
    expect(screen.getAllByText("stopped")).toHaveLength(1);
  });

  it("links the branch and PR to GitHub once a PR exists", async () => {
    setupInvoke(
      factoryProject,
      storyView({ prs: [{ url: "https://github.com/o/r/pull/77", state: "open", target: "develop" }] }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /feat\/FB-12-export/ }));
    expect(openUrl).toHaveBeenCalledWith("https://github.com/o/r/tree/feat/FB-12-export");
    await userEvent.click(screen.getByRole("button", { name: /#77 · open → develop/ }));
    expect(openUrl).toHaveBeenCalledWith("https://github.com/o/r/pull/77");
  });

  it("refuses a legacy project without asking for the Story", async () => {
    setupInvoke({ ...factoryProject, ladder: "legacy" });
    renderPage();
    expect(await screen.findByText("Flowboard is not a Factory project.")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("get_story", expect.anything());
  });
});
