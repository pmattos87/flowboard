import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NewReleaseDialog } from "@/features/releases/NewReleaseDialog";
import type { Task } from "@/types";

vi.mock("@/hooks/useReleases", () => ({
  useCreateRelease: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const longTitle = "Very long tested Story title that never breaks ".repeat(10).trim();

const candidate: Task = {
  id: 1, project_id: 1, task_number: 267, sprint_id: 1, parent_id: null, title: longTitle, description: "",
  type: "story", status: "tested", priority: "medium", assignee_id: null, story_points: 0, due_date: null,
  created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", labels: "",
  feature_branch: "fix/FB-267-long-titles", review_verdict: null, reviewed_commit: null, findings_url: null,
  run_stopped: false, risk: false, release_id: null, epic_id: null,
};

describe("NewReleaseDialog with a long Story title", () => {
  it("lets the form and row shrink so the title truncates, with the full title on hover", () => {
    expect(longTitle.length).toBeGreaterThan(300);
    render(<NewReleaseDialog projectKey="FB" releases={[]} candidates={[candidate]} onOpenChange={() => {}} />);

    const titleSpan = screen.getByText(longTitle);
    expect(titleSpan).toHaveClass("truncate", "min-w-0");
    expect(titleSpan).toHaveAttribute("title", longTitle);

    const row = titleSpan.closest("label");
    expect(row).not.toBeNull();
    expect(row).toHaveClass("min-w-0");

    const form = titleSpan.closest("form");
    expect(form).not.toBeNull();
    expect(form).toHaveClass("min-w-0");
  });
});
