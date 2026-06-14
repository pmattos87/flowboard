import { describe, it, expect } from "vitest";
import {
  buildSprintBoardRows,
  computeSprintDropPayload,
  parseSprintDroppableId,
  sprintDroppableId,
} from "@/features/boards/shared/sprintBoardGrouping";
import type { Sprint, Task } from "@/types";

const sprint = (
  id: number,
  name: string,
  status: Sprint["status"] = "active",
  start_date = "2024-01-01",
): Sprint => ({
  id,
  project_id: 1,
  name,
  goal: "",
  start_date,
  end_date: "2024-01-14",
  status,
});

const story = (id: number, sprint_id: number | null, priority: Task["priority"] = "medium"): Task => ({
  id,
  project_id: 1,
  sprint_id,
  parent_id: null,
  title: `Story ${id}`,
  description: "",
  type: "story",
  status: "todo",
  priority,
  assignee_id: null,
  story_points: 0,
  due_date: null,
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
  labels: "",
  task_number: id,
});

const sprints = [sprint(10, "Sprint 1"), sprint(11, "Sprint 2")];

describe("buildSprintBoardRows", () => {
  it("'all' filter renders every sprint then a backlog row at the bottom", () => {
    const tasks = [story(1, 10), story(2, 11), story(3, null)];
    const rows = buildSprintBoardRows(tasks, sprints, "all");
    expect(rows.map((r) => r.key)).toEqual([10, 11, "backlog"]);
    expect(rows[0].tasks.map((t) => t.id)).toEqual([1]);
    expect(rows[2].sprint).toBeNull();
    expect(rows[2].tasks.map((t) => t.id)).toEqual([3]);
  });

  it("single-sprint filter shows that sprint plus the backlog row", () => {
    const tasks = [story(1, 10), story(2, 11), story(3, null)];
    const rows = buildSprintBoardRows(tasks, sprints, 11);
    expect(rows.map((r) => r.key)).toEqual([11, "backlog"]);
    expect(rows[0].tasks.map((t) => t.id)).toEqual([2]);
  });

  it("'backlog' filter shows only the backlog row", () => {
    const tasks = [story(1, 10), story(3, null)];
    const rows = buildSprintBoardRows(tasks, sprints, "backlog");
    expect(rows.map((r) => r.key)).toEqual(["backlog"]);
    expect(rows[0].tasks.map((t) => t.id)).toEqual([3]);
  });

  it("orders sections active → backlog sprints → backlog row → completed", () => {
    const ordered = [
      sprint(20, "Done old", "completed", "2024-01-01"),
      sprint(21, "Backlog late", "backlog", "2024-03-01"),
      sprint(22, "Active", "active", "2024-02-01"),
      sprint(23, "Backlog early", "backlog", "2024-02-15"),
      sprint(24, "Done recent", "completed", "2024-01-20"),
    ];
    const tasks = [story(1, 22), story(2, null)];
    const rows = buildSprintBoardRows(tasks, ordered, "all");
    expect(rows.map((r) => r.key)).toEqual([
      22, // active
      23, // backlog sprint, earlier start first
      21, // backlog sprint, later start
      "backlog", // unscheduled pseudo-row
      24, // completed, most recent first
      20, // completed, older
    ]);
  });

  it("excludes non-story tasks and orders by priority, highest first", () => {
    const subtask: Task = { ...story(9, null), type: "task" };
    const tasks = [story(1, null, "low"), story(2, null, "critical"), subtask];
    const rows = buildSprintBoardRows(tasks, sprints, "backlog");
    expect(rows[0].tasks.map((t) => t.id)).toEqual([2, 1]);
  });
});

describe("sprint droppable id round-trip", () => {
  it("encodes and parses sprint and backlog ids", () => {
    expect(sprintDroppableId(7)).toBe("sprint:7");
    expect(sprintDroppableId("backlog")).toBe("backlog");
    expect(parseSprintDroppableId("sprint:7")).toBe(7);
    expect(parseSprintDroppableId("backlog")).toBe("backlog");
    expect(parseSprintDroppableId("todo:5")).toBeNull();
  });
});

describe("computeSprintDropPayload", () => {
  it("sets sprint_id when dropping onto a sprint", () => {
    expect(computeSprintDropPayload(story(1, null), 11)).toEqual({
      payload: { sprint_id: 11 },
      override: { sprint_id: 11 },
    });
  });

  it("clears sprint_id when dropping onto the backlog", () => {
    expect(computeSprintDropPayload(story(1, 10), "backlog")).toEqual({
      payload: { sprint_id: null },
      override: { sprint_id: null },
    });
  });

  it("returns null when the story is already in the target section", () => {
    expect(computeSprintDropPayload(story(1, 10), 10)).toBeNull();
    expect(computeSprintDropPayload(story(1, null), "backlog")).toBeNull();
  });
});
