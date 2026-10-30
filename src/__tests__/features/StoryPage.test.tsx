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
    key: "FB-12", title: "Export contract", type: "story", status: "building", priority: "high", labels: "",
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

function setupInvoke(project = factoryProject, view = storyView(), task: object = storyTask) {
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "list_projects") return Promise.resolve([project]);
    if (cmd === "get_project") return Promise.resolve(project);
    if (cmd === "list_tasks") return Promise.resolve([task]);
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
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/story/${key}`]}>
        <Routes>
          <Route path="/story/:key" element={<StoryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, qc };
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

  it("shows a new description from an outside write without remounting", async () => {
    setupInvoke();
    const { qc } = renderPage();
    expect(await screen.findByText("Brief text")).toBeInTheDocument();
    setupInvoke(factoryProject, storyView(), { ...storyTask, description: "Brief from the Factory" });
    await qc.invalidateQueries();
    expect(await screen.findByText("Brief from the Factory")).toBeInTheDocument();
    expect(screen.queryByText("Brief text")).not.toBeInTheDocument();
  });

  it("links each Depends on key to its Story page", async () => {
    const nineTask = { ...storyTask, id: 8, task_number: 9, title: "Earlier Story" };
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "list_projects") return Promise.resolve([factoryProject]);
      if (cmd === "get_project") return Promise.resolve(factoryProject);
      if (cmd === "list_tasks") return Promise.resolve([storyTask, nineTask]);
      if (cmd === "get_story") {
        const key = (args as { key: string }).key;
        return Promise.resolve(key === "FB-9" ? storyView({ key, title: "Earlier Story", depends_on: [] }) : storyView({ depends_on: ["FB-9", "FB-10"] }));
      }
      return Promise.resolve([]);
    });
    renderPage();
    await screen.findByDisplayValue("Export contract");
    const nine = screen.getByRole("link", { name: "FB-9" });
    expect(nine).toHaveAttribute("href", "/story/FB-9");
    expect(nine).not.toHaveAttribute("target");
    expect(screen.getByRole("link", { name: "FB-10" })).toHaveAttribute("href", "/story/FB-10");
    expect(screen.getAllByRole("link")).toHaveLength(2);
    await userEvent.click(screen.getByRole("link", { name: "FB-9" }));
    // The linked Story's page opens: its title replaces this Story's.
    expect(await screen.findByDisplayValue("Earlier Story")).toBeInTheDocument();
    expect(screen.getByText("FB-9")).toBeInTheDocument();
  });

  it("shows a dash and no link when the Story depends on nothing", async () => {
    setupInvoke(factoryProject, storyView({ depends_on: [] }));
    renderPage();
    await screen.findByDisplayValue("Export contract");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Depends on").nextElementSibling).toHaveTextContent("—");
  });

  it("renders the Run section above the description", async () => {
    setupInvoke();
    renderPage();
    const description = await screen.findByText("Description");
    for (const heading of ["Run", "Review rounds", "Trail"]) {
      const el = screen.getByText(heading);
      expect(el.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("shows the Run graph's nodes for a Story with no Subtasks and an empty trail", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "list_projects") return Promise.resolve([factoryProject]);
      if (cmd === "get_project") return Promise.resolve(factoryProject);
      if (cmd === "list_tasks") return Promise.resolve([{ ...storyTask, status: "backlog", run_stopped: false }]);
      if (cmd === "get_story")
        return Promise.resolve(storyView({ status: "backlog", flags: { stopped: false, waiting_on_bugs: 0 } }));
      return Promise.resolve([]);
    });
    renderPage();
    const run = await screen.findByText("Run");
    const section = run.closest("section");
    expect(section).not.toBeNull();
    expect(section!.querySelectorAll("[data-node]").length).toBeGreaterThan(0);
  });

  it("refuses a legacy project without asking for the Story", async () => {
    setupInvoke({ ...factoryProject, ladder: "legacy" });
    renderPage();
    expect(await screen.findByText("Flowboard is not a Factory project.")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("get_story", expect.anything());
  });
});
