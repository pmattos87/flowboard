import { describe, it, expect } from "vitest";
import type { Task } from "@/types";
import {
  buildTaskBoardRows,
  computeDropPayload,
  parseDroppableId,
  progressOf,
} from "@/features/boards/shared/taskBoardGrouping";

function makeTask(overrides: Partial<Task> & { id: number }): Task {
  return {
    project_id: 1,
    task_number: 1,
    sprint_id: null,
    parent_id: null,
    title: `Task ${overrides.id}`,
    description: "",
    type: "task",
    status: "todo",
    priority: "medium",
    assignee_id: null,
    story_points: 0,
    due_date: null,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    labels: "",
    ...overrides,
  };
}

describe("buildTaskBoardRows", () => {
  it("groups task/bug children under their parent story", () => {
    const story = makeTask({ id: 10, type: "story" });
    const childTask = makeTask({ id: 20, type: "task", parent_id: 10 });
    const childBug = makeTask({ id: 21, type: "bug", parent_id: 10 });

    const rows = buildTaskBoardRows([story, childTask, childBug], "all");

    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe(10);
    expect(rows[0].story).toBe(story);
    expect(rows[0].children.map((c) => c.id).sort()).toEqual([20, 21]);
  });

  it("includes stories with zero children as rows", () => {
    const story = makeTask({ id: 7, type: "story" });

    const rows = buildTaskBoardRows([story], "all");

    expect(rows).toHaveLength(1);
    expect(rows[0].children).toEqual([]);
  });

  it("appends an Unparented row when there are orphan task/bug rows", () => {
    const story = makeTask({ id: 10, type: "story" });
    const orphan = makeTask({ id: 30, type: "task", parent_id: null });
    const orphanBug = makeTask({ id: 31, type: "bug", parent_id: null });

    const rows = buildTaskBoardRows([story, orphan, orphanBug], "all");

    expect(rows).toHaveLength(2);
    expect(rows[1].key).toBe("unparented");
    expect(rows[1].story).toBeNull();
    expect(rows[1].children.map((c) => c.id).sort()).toEqual([30, 31]);
  });

  it("omits Unparented entirely when there are no orphans", () => {
    const story = makeTask({ id: 10, type: "story" });
    const child = makeTask({ id: 20, type: "task", parent_id: 10 });

    const rows = buildTaskBoardRows([story, child], "all");

    expect(rows.find((r) => r.key === "unparented")).toBeUndefined();
  });

  it("applies the sprint filter to the story set (backlog only)", () => {
    const backlogStory = makeTask({ id: 10, type: "story", sprint_id: null });
    const sprintStory = makeTask({ id: 11, type: "story", sprint_id: 5 });

    const rows = buildTaskBoardRows([backlogStory, sprintStory], "backlog");

    expect(rows.map((r) => r.key)).toEqual([10]);
  });

  it("applies the sprint filter to the story set (specific sprint)", () => {
    const backlogStory = makeTask({ id: 10, type: "story", sprint_id: null });
    const sprintStory = makeTask({ id: 11, type: "story", sprint_id: 5 });

    const rows = buildTaskBoardRows([backlogStory, sprintStory], 5);

    expect(rows.map((r) => r.key)).toEqual([11]);
  });

  it("applies the sprint filter to Unparented orphans too", () => {
    const orphanInBacklog = makeTask({
      id: 30, type: "task", parent_id: null, sprint_id: null,
    });
    const orphanInSprint = makeTask({
      id: 31, type: "task", parent_id: null, sprint_id: 5,
    });

    const rows = buildTaskBoardRows(
      [orphanInBacklog, orphanInSprint],
      "backlog",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("unparented");
    expect(rows[0].children.map((c) => c.id)).toEqual([30]);
  });

  it("orders story rows by ascending id", () => {
    const a = makeTask({ id: 7, type: "story" });
    const b = makeTask({ id: 3, type: "story" });
    const c = makeTask({ id: 12, type: "story" });

    const rows = buildTaskBoardRows([a, b, c], "all");

    expect(rows.map((r) => r.key)).toEqual([3, 7, 12]);
  });
});

describe("progressOf", () => {
  it("counts done out of total", () => {
    expect(
      progressOf([
        makeTask({ id: 1, status: "todo" }),
        makeTask({ id: 2, status: "done" }),
        makeTask({ id: 3, status: "done" }),
      ]),
    ).toEqual({ done: 2, total: 3 });
  });

  it("handles empty child list as 0/0", () => {
    expect(progressOf([])).toEqual({ done: 0, total: 0 });
  });
});

describe("computeDropPayload", () => {
  it("returns null when status, parent, and sprint all match", () => {
    const story = makeTask({ id: 10, type: "story" });
    const child = makeTask({ id: 20, type: "task", parent_id: 10, status: "todo" });
    expect(
      computeDropPayload(child, { status: "todo", group: 10 }, [story, child]),
    ).toBeNull();
  });

  it("emits status only on a same-row column change", () => {
    const story = makeTask({ id: 10, type: "story" });
    const child = makeTask({ id: 20, type: "task", parent_id: 10, status: "todo" });
    const out = computeDropPayload(
      child,
      { status: "in_progress", group: 10 },
      [story, child],
    );
    expect(out).not.toBeNull();
    expect(out!.payload).toEqual({ status: "in_progress" });
    expect(out!.override).toEqual({ status: "in_progress" });
  });

  it("reparents to a new story and inherits the story's sprint", () => {
    const sourceStory = makeTask({ id: 10, type: "story", sprint_id: null });
    const targetStory = makeTask({ id: 11, type: "story", sprint_id: 5 });
    const child = makeTask({
      id: 20, type: "task", parent_id: 10, status: "todo", sprint_id: null,
    });

    const out = computeDropPayload(
      child,
      { status: "in_progress", group: 11 },
      [sourceStory, targetStory, child],
    );

    expect(out).not.toBeNull();
    expect(out!.payload).toEqual({
      status: "in_progress",
      parent_id: 11,
      sprint_id: 5,
    });
  });

  it("does not change sprint when target story is in the same sprint", () => {
    const sourceStory = makeTask({ id: 10, type: "story", sprint_id: 5 });
    const targetStory = makeTask({ id: 11, type: "story", sprint_id: 5 });
    const child = makeTask({
      id: 20, type: "task", parent_id: 10, status: "todo", sprint_id: 5,
    });

    const out = computeDropPayload(
      child,
      { status: "todo", group: 11 },
      [sourceStory, targetStory, child],
    );

    expect(out).not.toBeNull();
    expect(out!.payload).toEqual({ parent_id: 11 });
  });

  it("unparenting clears parent_id and keeps the task's existing sprint", () => {
    const story = makeTask({ id: 10, type: "story", sprint_id: 5 });
    const child = makeTask({
      id: 20, type: "task", parent_id: 10, status: "in_progress", sprint_id: 5,
    });

    const out = computeDropPayload(
      child,
      { status: "in_progress", group: "unparented" },
      [story, child],
    );

    expect(out).not.toBeNull();
    expect(out!.payload).toEqual({ parent_id: null });
  });

  it("dropping an orphan onto a story sets both parent_id and sprint_id", () => {
    const story = makeTask({ id: 10, type: "story", sprint_id: 7 });
    const orphan = makeTask({
      id: 20, type: "task", parent_id: null, status: "todo", sprint_id: null,
    });

    const out = computeDropPayload(
      orphan,
      { status: "done", group: 10 },
      [story, orphan],
    );

    expect(out).not.toBeNull();
    expect(out!.payload).toEqual({
      status: "done",
      parent_id: 10,
      sprint_id: 7,
    });
  });
});

describe("parseDroppableId", () => {
  it("parses status:storyId", () => {
    expect(parseDroppableId("in_progress:42")).toEqual({
      status: "in_progress",
      group: 42,
    });
  });

  it("parses status:unparented", () => {
    expect(parseDroppableId("todo:unparented")).toEqual({
      status: "todo",
      group: "unparented",
    });
  });

  it("returns null on malformed id", () => {
    expect(parseDroppableId("no-colon-here")).toBeNull();
  });
});
