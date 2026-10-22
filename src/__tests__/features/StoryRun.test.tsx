import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { StoryRun } from "@/features/story/StoryRun";
import type { Project, Task } from "@/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }));

const mockInvoke = vi.mocked(invoke);

const story: Task = {
  id: 1, project_id: 1, task_number: 7, sprint_id: 3, parent_id: null,
  title: "S", description: "", type: "story", status: "building", priority: "medium",
  assignee_id: null, story_points: 0, due_date: null, created_at: "", updated_at: "",
  labels: "", feature_branch: null, review_verdict: null, reviewed_commit: null,
  findings_url: null, run_stopped: false, risk: false, release_id: null,
};
const project: Project = {
  id: 1, name: "Flowboard", key: "FB", description: "", color: "", created_at: "",
  logo_data: null, position: 0, ladder: "factory", kind: "internal",
};

function renderRun(trail: unknown[]) {
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "get_story_trail") return Promise.resolve(trail);
    if (cmd === "list_tasks") return Promise.resolve([story]);
    return Promise.resolve([]);
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <div id="comment-24">the findings comment</div>
      <StoryRun story={story} storyKey="FB-7" project={project} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("StoryRun", () => {
  it("lists Review rounds and scrolls to a comment's findings", async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    renderRun([
      { at: "2026-10-20T10:00:00Z", action: "review_round", old: "", new: { round: 1, verdict: "failed", commit: "d682b4d6773a", findings_url: "flowboard://comment/24" }, by: "Claude" },
      { at: "2026-10-21T10:00:00Z", action: "review_round", old: "", new: { round: 2, verdict: "passed", commit: "abc1234ffff", findings_url: "" }, by: "Claude" },
    ]);
    expect(await screen.findByText("r1")).toBeInTheDocument();
    expect(screen.getByText("d682b4d")).toBeInTheDocument();
    expect(screen.getByText("passed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "findings" }));
    expect(scroll).toHaveBeenCalled();
  });

  it("says Review has not started when there are no rounds", async () => {
    renderRun([]);
    expect(await screen.findByText(/Not started/)).toBeInTheDocument();
  });

  it("shows the trail newest first", async () => {
    renderRun([
      { at: "2026-10-20T10:00:00Z", action: "created", old: "", new: "backlog", by: "Pedro" },
      { at: "2026-10-21T10:00:00Z", action: "run_stopped", old: "", new: { reason: "Verify failed twice" }, by: "Claude" },
    ]);
    const first = await screen.findByText("Run stopped");
    const second = screen.getByText("Story created (backlog)");
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText("Verify failed twice").length).toBeGreaterThan(0);
  });
});
