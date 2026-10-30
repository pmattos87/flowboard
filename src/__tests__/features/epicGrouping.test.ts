import { describe, it, expect } from "vitest";
import type { Task } from "@/types";
import { buildEpicRows, factoryDiscoveryStories } from "@/features/boards/shared/epicGrouping";

function task(over: Partial<Task>): Task {
  return {
    id: 1, project_id: 1, task_number: 1, sprint_id: null, parent_id: null,
    title: "", description: "", type: "story", status: "backlog", priority: "medium",
    assignee_id: null, story_points: 0, due_date: null, created_at: "", updated_at: "",
    labels: "", feature_branch: null, review_verdict: null, reviewed_commit: null,
    findings_url: null, run_stopped: false, risk: false, release_id: null, epic_id: null,
    ...over,
  };
}

const epicA = task({ id: 10, type: "epic", status: "todo", title: "Epic A" });
const epicB = task({ id: 20, type: "epic", status: "todo", title: "Epic B (empty)" });
const epicDone = task({ id: 30, type: "epic", status: "done", title: "Done epic with card" });
const epicCanceled = task({ id: 40, type: "epic", status: "canceled", title: "Canceled epic, no card" });
const epicDoneScheduledOnly = task({ id: 50, type: "epic", status: "done", title: "Done epic, scheduled only" });

const epicDoneUnscheduledDone = task({ id: 60, type: "epic", status: "done", title: "Done epic, only a done Story" });

const tasks = [
  // Out of id order on purpose: rows follow epic creation order.
  epicB, epicDone, epicA, epicCanceled, epicDoneScheduledOnly, epicDoneUnscheduledDone,
  task({ id: 1, epic_id: 10, title: "A1" }),
  task({ id: 2, epic_id: 10, type: "bug", status: "refining", title: "A2 bug Story" }),
  task({ id: 3, epic_id: 10, sprint_id: 7, status: "building", title: "A scheduled" }),
  task({ id: 4, epic_id: 30, status: "canceled", title: "Done epic card" }),
  task({ id: 5, epic_id: 50, sprint_id: 7, status: "building", title: "Scheduled of done epic" }),
  // Unscheduled but `done` (its sprint was deleted): no Discovery column renders it.
  task({ id: 10, epic_id: 60, status: "done", title: "Done, sprint deleted" }),
  task({ id: 6, title: "Loose" }),
  task({ id: 7, parent_id: 1, type: "subtask", status: "todo", title: "Subtask" }),
  task({ id: 8, parent_id: 1, type: "bug", status: "todo", title: "Bug Subtask" }),
  task({ id: 9, epic_id: 999, title: "Unknown epic" }),
];

const titles = (rows: ReturnType<typeof buildEpicRows>) =>
  rows.map((r) => ({ key: r.key, stories: r.stories.map((s) => s.title) }));

describe("buildEpicRows", () => {
  const rows = buildEpicRows(tasks);

  it("lists open epics in creation order, an empty open epic included", () => {
    expect(rows.map((r) => r.key)).toEqual([10, 20, 30, "none"]);
    expect(rows[1].stories).toEqual([]);
  });

  it("keeps a closed epic's row only while it holds a Story the board shows", () => {
    expect(rows.find((r) => r.key === 30)?.stories.map((s) => s.title)).toEqual(["Done epic card"]);
    expect(rows.find((r) => r.key === 40)).toBeUndefined();
    // A scheduled Story is not on the board, so it does not keep its done epic's row.
    expect(rows.find((r) => r.key === 50)).toBeUndefined();
    // Nor does an unscheduled `done` Story, which no column renders.
    expect(rows.find((r) => r.key === 60)).toBeUndefined();
    expect(rows.flatMap((r) => r.stories.map((s) => s.title))).not.toContain("Done, sprint deleted");
  });

  it("puts the No epic row last, with Stories whose epic has no row", () => {
    expect(rows[rows.length - 1]).toMatchObject({ key: "none", epic: null });
    expect(rows[rows.length - 1].stories.map((s) => s.title)).toEqual(["Loose", "Unknown epic"]);
  });

  it("leaves out scheduled Stories and Subtasks", () => {
    const all = rows.flatMap((r) => r.stories.map((s) => s.title));
    expect(all).not.toContain("A scheduled");
    expect(all).not.toContain("Scheduled of done epic");
    expect(all).not.toContain("Subtask");
    expect(all).not.toContain("Bug Subtask");
    expect(titles(rows)[0]).toEqual({ key: 10, stories: ["A1", "A2 bug Story"] });
  });

  it("never makes an epic a card", () => {
    const all = rows.flatMap((r) => r.stories);
    expect(all.some((s) => s.type === "epic")).toBe(false);
    expect(factoryDiscoveryStories(tasks).some((s) => s.type === "epic")).toBe(false);
  });

  it("puts every Story of the ungrouped board in exactly one row", () => {
    const shown = factoryDiscoveryStories(tasks).map((s) => s.id).sort((a, b) => a - b);
    const placed = rows.flatMap((r) => r.stories.map((s) => s.id)).sort((a, b) => a - b);
    expect(placed).toEqual(shown);
    expect(new Set(placed).size).toBe(placed.length);
  });

  it("omits the No epic row when every Story has an epic row", () => {
    expect(buildEpicRows([epicA, task({ id: 1, epic_id: 10 })]).map((r) => r.key)).toEqual([10]);
  });
});
