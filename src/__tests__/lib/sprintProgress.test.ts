import { describe, it, expect } from "vitest";
import { sprintCompletion } from "@/lib/sprintProgress";
import type { TaskStatus, TaskType } from "@/types";

const item = (status: TaskStatus, story_points: number, type: TaskType = "story") => ({
  type, status, story_points,
});

describe("sprintCompletion", () => {
  it("is 0 / 0 / 0 for an empty list", () => {
    expect(sprintCompletion([])).toEqual({ donePoints: 0, totalPoints: 0, percent: 0, byStatus: {} });
  });

  it("is 0 / 0 / 0 when the counted items have no points", () => {
    const r = sprintCompletion([item("done", 0), item("todo", 0)]);
    expect([r.donePoints, r.totalPoints, r.percent]).toEqual([0, 0, 0]);
  });

  it("is 75% for 3 done points and 1 todo point", () => {
    const r = sprintCompletion([item("done", 3), item("todo", 1)]);
    expect(r).toMatchObject({ donePoints: 3, totalPoints: 4, percent: 75 });
  });

  it("drops canceled points from the total but keeps them in byStatus", () => {
    const r = sprintCompletion([item("done", 2), item("canceled", 2)]);
    expect(r).toMatchObject({ donePoints: 2, totalPoints: 2, percent: 100 });
    expect(r.byStatus).toEqual({ done: 2, canceled: 2 });
  });

  it("is 100% when every item is done or canceled", () => {
    const r = sprintCompletion([item("done", 1), item("done", 4), item("canceled", 3)]);
    expect(r.percent).toBe(100);
  });

  it("is 0% (not 100%) when every item is canceled, keeping the canceled points in byStatus", () => {
    const r = sprintCompletion([item("canceled", 3), item("canceled", 2)]);
    expect(r).toEqual({ donePoints: 0, totalPoints: 0, percent: 0, byStatus: { canceled: 5 } });
  });

  it("rounds to an integer percentage (1 of 3 is 33)", () => {
    expect(sprintCompletion([item("done", 1), item("todo", 2)]).percent).toBe(33);
  });

  it("counts only done as done on the factory ladder", () => {
    const r = sprintCompletion([
      item("done", 1),
      item("integrated_tests", 2),
      item("tested", 3),
      item("user_testing", 4),
      item("building", 5),
    ]);
    expect(r.donePoints).toBe(1);
    expect(r.totalPoints).toBe(15);
    expect(r.percent).toBe(7);
    expect(r.byStatus).toEqual({ done: 1, integrated_tests: 2, tested: 3, user_testing: 4, building: 5 });
  });

  it("ignores bugs and subtasks", () => {
    const r = sprintCompletion([item("done", 2), item("todo", 3, "bug"), item("done", 5, "subtask"), item("done", 8, "epic")]);
    expect(r).toMatchObject({ donePoints: 2, totalPoints: 2, percent: 100 });
    expect(r.byStatus).toEqual({ done: 2 });
  });
});
