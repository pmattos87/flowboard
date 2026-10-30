import { describe, it, expect } from "vitest";
import { reportedTasks } from "@/features/reports/reportedTasks";
import type { Task } from "@/types";

const base: Task = {
  id: 1, project_id: 1, task_number: 1, sprint_id: 1, parent_id: null,
  title: "", description: "", type: "story", status: "done",
  priority: "medium", assignee_id: null, story_points: 0, due_date: null,
  created_at: "", updated_at: "", labels: "", feature_branch: null,
  review_verdict: null, reviewed_commit: null, findings_url: null,
  run_stopped: false, risk: false, release_id: null, epic_id: null,
};

// A done Story worth 5, sized by its two done Subtasks (2 + 3), in sprint 1.
const tasks: Task[] = [
  { ...base, id: 1, story_points: 5 },
  { ...base, id: 2, type: "subtask", parent_id: 1, story_points: 2 },
  { ...base, id: 3, type: "subtask", parent_id: 1, story_points: 3 },
];

const sprintPoints = (ts: Task[]) =>
  ts.filter((t) => t.sprint_id === 1 && t.status === "done").reduce((sum, t) => sum + t.story_points, 0);

describe("reportedTasks", () => {
  it("counts a Factory Story's points once, not again through its Subtasks", () => {
    expect(sprintPoints(reportedTasks(tasks, "factory"))).toBe(5);
    expect(reportedTasks(tasks, "factory").map((t) => t.id)).toEqual([1]);
  });

  it("counts every task on a legacy project, as before", () => {
    expect(sprintPoints(reportedTasks(tasks, "legacy"))).toBe(10);
    expect(reportedTasks(tasks, undefined)).toHaveLength(3);
  });
});
