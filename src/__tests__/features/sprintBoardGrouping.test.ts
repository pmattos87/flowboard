import { describe, it, expect } from "vitest";
import {
  buildSprintBoardRows,
  computeSprintDropPayload,
  isSprintScheduleBlocked,
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

const story = (
  id: number,
  sprint_id: number | null,
  priority: Task["priority"] = "medium",
  // Backlog stories only appear on the planning board once "Ready for
  // Development" (FB-85), so that is the default for unscheduled stories.
  status: Task["status"] = sprint_id === null ? "ready_for_development" : "todo",
): Task => ({
  id,
  project_id: 1,
  sprint_id,
  parent_id: null,
  title: `Story ${id}`,
  description: "",
  type: "story",
  status,
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

  it("backlog row shows only 'ready_for_development' stories (FB-85)", () => {
    const tasks = [
      story(1, null, "medium", "ready_for_development"),
      story(2, null, "medium", "todo"),
      story(3, null, "medium", "refining"),
      story(4, null, "medium", "canceled"),
    ];
    const rows = buildSprintBoardRows(tasks, sprints, "backlog");
    expect(rows[0].tasks.map((t) => t.id)).toEqual([1]);
  });

  it("keeps in-sprint stories visible regardless of status", () => {
    const tasks = [story(1, 10, "medium", "in_progress"), story(2, 10, "medium", "done")];
    const rows = buildSprintBoardRows(tasks, sprints, 10);
    expect(rows[0].tasks.map((t) => t.id)).toEqual([1, 2]);
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
  it("sets sprint_id and resets status to todo when scheduling from the backlog", () => {
    expect(computeSprintDropPayload(story(1, null), 11)).toEqual({
      payload: { sprint_id: 11, status: "todo" },
      override: { sprint_id: 11, status: "todo" },
    });
  });

  it("does not reset status when moving between sprints", () => {
    expect(computeSprintDropPayload(story(1, 10, "medium", "in_progress"), 11)).toEqual({
      payload: { sprint_id: 11 },
      override: { sprint_id: 11 },
    });
  });

  it("clears sprint_id and restores ready_for_development when unscheduling", () => {
    expect(computeSprintDropPayload(story(1, 10, "medium", "in_progress"), "backlog")).toEqual({
      payload: { sprint_id: null, status: "ready_for_development" },
      override: { sprint_id: null, status: "ready_for_development" },
    });
  });

  it("survives a sprint round-trip — the story lands back where it started", () => {
    const original = story(1, null, "medium", "ready_for_development");

    const scheduled = computeSprintDropPayload(original, 11)!;
    expect(scheduled.payload).toEqual({ sprint_id: 11, status: "todo" });

    // The story as the server now has it, dragged straight back out.
    const inSprint: Task = { ...original, ...scheduled.payload };
    const unscheduled = computeSprintDropPayload(inSprint, "backlog")!;

    expect({ ...inSprint, ...unscheduled.payload }).toMatchObject({
      sprint_id: null,
      status: "ready_for_development",
    });
    // …and it is visible on the unscheduled row again, which is the bug.
    const rows = buildSprintBoardRows(
      [{ ...inSprint, ...unscheduled.payload }],
      sprints,
      "backlog",
    );
    expect(rows[0].tasks.map((t) => t.id)).toEqual([1]);
  });

  // The detail panel's sprint picker shares this function, so it also sees
  // tasks, bugs and epics — which live only in the dev workflow.
  it("leaves status alone for non-story types in both directions", () => {
    for (const type of ["task", "bug", "epic"] as const) {
      const scheduled = { ...story(1, null, "medium", "in_progress"), type };
      expect(computeSprintDropPayload(scheduled, 11)).toEqual({
        payload: { sprint_id: 11 },
        override: { sprint_id: 11 },
      });

      const unscheduled = { ...story(1, 10, "medium", "in_progress"), type };
      expect(computeSprintDropPayload(unscheduled, "backlog")).toEqual({
        payload: { sprint_id: null },
        override: { sprint_id: null },
      });
    }
  });

  it("returns null when the story is already in the target section", () => {
    expect(computeSprintDropPayload(story(1, 10), 10)).toBeNull();
    expect(computeSprintDropPayload(story(1, null), "backlog")).toBeNull();
  });
});

describe("isSprintScheduleBlocked (FB-85)", () => {
  it("blocks scheduling a non-ready backlog story into a sprint", () => {
    expect(isSprintScheduleBlocked(story(1, null, "medium", "todo"), 11)).toBe(true);
    expect(isSprintScheduleBlocked(story(1, null, "medium", "refining"), 11)).toBe(true);
  });

  it("allows a ready-for-development backlog story into a sprint", () => {
    expect(isSprintScheduleBlocked(story(1, null, "medium", "ready_for_development"), 11)).toBe(false);
  });

  it("never blocks moving between sprints or back to the backlog", () => {
    expect(isSprintScheduleBlocked(story(1, 10, "medium", "in_progress"), 11)).toBe(false);
    expect(isSprintScheduleBlocked(story(1, null, "medium", "todo"), "backlog")).toBe(false);
  });

  // FB-90: the gate is reused by the detail panel and the create modal, which —
  // unlike the Sprint Planning Board — also see tasks, bugs and epics. Those
  // never reach "ready_for_development", so gating them would lock them out of
  // sprints entirely.
  it("only gates stories — tasks, bugs and epics pass through", () => {
    for (const type of ["task", "bug", "epic"] as const) {
      const item: Task = { ...story(1, null, "medium", "todo"), type };
      expect(isSprintScheduleBlocked(item, 11)).toBe(false);
    }
  });
});
