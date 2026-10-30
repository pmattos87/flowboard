import { describe, it, expect } from "vitest";
import { epicProgress } from "@/lib/epicProgress";
import type { TaskStatus, TaskType } from "@/types";

const EPIC = 7;

const story = (
  status: TaskStatus,
  story_points: number,
  extra: { type?: TaskType; parent_id?: number | null; epic_id?: number | null } = {},
) => ({
  type: extra.type ?? ("story" as TaskType),
  parent_id: extra.parent_id ?? null,
  epic_id: extra.epic_id === undefined ? EPIC : extra.epic_id,
  status,
  story_points,
});

describe("epicProgress", () => {
  it("is all zeros for an epic with no Stories", () => {
    expect(epicProgress(EPIC, [])).toEqual({
      stages: { building: 0, tested: 0, done: 0 },
      tested: 0,
      total: 0,
      pointsLeft: 0,
    });
  });

  it("derives stages, n/m and points left across the ladder", () => {
    const r = epicProgress(EPIC, [
      story("backlog", 1),
      story("ready", 2),
      story("building", 3),
      story("integrated_tests", 5),
      story("tested", 8),
      story("user_testing", 13),
      story("done", 21),
      story("canceled", 34),
    ]);
    expect(r.stages).toEqual({ building: 2, tested: 2, done: 1 });
    // n: tested + user_testing + done; m: everything but canceled.
    expect(r.tested).toBe(3);
    expect(r.total).toBe(7);
    // Not done/canceled: 1 + 2 + 3 + 5 + 8 + 13.
    expect(r.pointsLeft).toBe(32);
  });

  it("counts every discovery stage (backlog / refining / ready) in m and points left only", () => {
    const r = epicProgress(EPIC, [story("backlog", 1), story("refining", 2), story("ready", 4)]);
    expect(r).toEqual({ stages: { building: 0, tested: 0, done: 0 }, tested: 0, total: 3, pointsLeft: 7 });
  });

  it("does not count the epic row itself", () => {
    const epicRow = { type: "epic" as TaskType, parent_id: null, epic_id: null, status: "todo" as TaskStatus, story_points: 0 };
    const selfLinked = { ...epicRow, epic_id: EPIC };
    expect(epicProgress(EPIC, [epicRow, selfLinked, story("tested", 3)])).toMatchObject({ tested: 1, total: 1, pointsLeft: 3 });
  });

  it("does not count a Story of another epic or of no epic", () => {
    const r = epicProgress(EPIC, [
      story("tested", 3),
      story("tested", 5, { epic_id: 99 }),
      story("building", 8, { epic_id: null }),
    ]);
    expect(r).toMatchObject({ tested: 1, total: 1, pointsLeft: 3 });
  });

  it("counts a scheduled Story", () => {
    // Stories reach building only once scheduled; the helper ignores sprint_id altogether.
    const scheduled = { ...story("building", 5), sprint_id: 3 };
    expect(epicProgress(EPIC, [scheduled])).toMatchObject({
      stages: { building: 1, tested: 0, done: 0 },
      total: 1,
      pointsLeft: 5,
    });
  });

  it("counts a bug Story but not a bug Subtask or a subtask", () => {
    const r = epicProgress(EPIC, [
      story("done", 2, { type: "bug" }),
      story("todo", 3, { type: "bug", parent_id: 1 }),
      story("todo", 5, { type: "subtask", parent_id: 1 }),
    ]);
    expect(r).toMatchObject({ stages: { building: 0, tested: 0, done: 1 }, tested: 1, total: 1, pointsLeft: 0 });
  });
});
