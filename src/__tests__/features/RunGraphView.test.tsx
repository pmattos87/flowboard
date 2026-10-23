import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RunGraphView, edgeStyle } from "@/features/story/RunGraphView";
import { runGraph } from "@/features/story/runGraph";
import type { Task, TrailEvent } from "@/types";

function task(over: Partial<Task>): Task {
  return {
    id: 1, project_id: 1, task_number: 1, sprint_id: 3, parent_id: null,
    title: "", description: "", type: "story", status: "building", priority: "medium",
    assignee_id: null, story_points: 0, due_date: null, created_at: "", updated_at: "",
    labels: "", feature_branch: null, review_verdict: null, reviewed_commit: null,
    findings_url: null, run_stopped: true, risk: false, release_id: null,
    ...over,
  };
}

const ev = (action: string, data: Record<string, unknown> | string): TrailEvent => ({ at: "", action, old: "", new: data, by: "" });

describe("RunGraphView", () => {
  it("draws one node per Subtask with its agent and rounds, and each node's state", () => {
    const graph = runGraph({
      story: task({}),
      subtasks: [
        task({ id: 2, task_number: 2, parent_id: 1, type: "subtask", status: "done", title: "Template layout" }),
        task({ id: 3, task_number: 3, parent_id: 1, type: "subtask", status: "in_progress", title: "Signature block" }),
      ],
      trail: [
        ev("stage_entered", "building"),
        ev("subtask_handoff", { subtask: "FB-3", agent: "implementer", model: "sonnet" }),
        ev("verify_round", { subtask: "FB-3", round: 1, result: "fail" }),
        ev("run_stopped", { reason: "Verify failed twice" }),
      ],
      projectKey: "FB",
      clientProject: false,
    });
    const { container } = render(<RunGraphView graph={graph} />);
    expect(screen.getByText("Template layout")).toBeInTheDocument();
    expect(screen.getByText("implementer · sonnet")).toBeInTheDocument();
    expect(screen.getByText("r1✗")).toBeInTheDocument();
    const state = (id: string) => container.querySelector(`[data-node="${id}"]`)?.getAttribute("data-state");
    expect(state("sub-2")).toBe("done");
    expect(state("sub-3")).toBe("stopped");
    expect(state("stop")).toBe("stopped");
    expect(state("production")).toBe("todo");
    expect(screen.getByText("PLAN")).toBeInTheDocument();
    expect(screen.queryByText("User testing")).not.toBeInTheDocument();
  });

  it("opens fitted and toggles to actual size and back", () => {
    const graph = runGraph({ story: task({}), subtasks: [], trail: [], projectKey: "FB", clientProject: false });
    render(<RunGraphView graph={graph} />);
    fireEvent.click(screen.getByRole("button", { name: "Actual size" }));
    fireEvent.click(screen.getByRole("button", { name: "Fit graph" }));
    expect(screen.getByRole("button", { name: "Actual size" })).toBeInTheDocument();
  });
});

describe("edgeStyle", () => {
  const box = (state: "done" | "current" | "stopped" | "todo") => ({ x: 0, y: 0, w: 1, h: 1, state });
  const RED = "#ef4444", GREEN = "#34d399", DIM = "#4b5563";

  it("reds only edges out of a stopped node", () => {
    expect(edgeStyle({ a: box("stopped"), b: box("stopped") }).stroke).toBe(RED); // failing Subtask → Verify
    expect(edgeStyle({ a: box("current"), b: box("stopped") }).stroke).toBe(GREEN); // handoff → failing Subtask
    expect(edgeStyle({ a: box("done"), b: box("stopped") }).stroke).toBe(GREEN); // passed Subtask → Verify
    expect(edgeStyle({ a: box("done"), b: box("done") }).stroke).toBe(GREEN);
  });

  it("dims any edge touching a node not reached", () => {
    expect(edgeStyle({ a: box("todo"), b: box("stopped") }).stroke).toBe(DIM);
    expect(edgeStyle({ a: box("stopped"), b: box("todo") }).stroke).toBe(DIM);
  });
});
