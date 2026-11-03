import { describe, it, expect } from "vitest";
import type { Project, Task, TaskStatus } from "@/types";
import { invisibleStories } from "@/features/boards/shared/invisibleStories";

// FB-93: the expected sets are written out here, not read from the board column
// constants, so a column change that strands a status fails this file.

function task(over: Partial<Task>): Task {
  return {
    id: 1, project_id: 1, task_number: 1, sprint_id: null, parent_id: null,
    title: "", description: "", type: "story", status: "todo", priority: "medium",
    assignee_id: null, story_points: 0, due_date: null, created_at: "", updated_at: "",
    labels: "", feature_branch: null, review_verdict: null, reviewed_commit: null,
    findings_url: null, run_stopped: false, risk: false, release_id: null, epic_id: null,
    ...over,
  };
}

const ALL_STATUSES: TaskStatus[] = [
  "todo", "in_progress", "in_review", "refining", "ready_for_development", "canceled", "done",
  "backlog", "ready", "building", "integrated_tests", "tested", "user_testing",
];

type Kind = "story" | "epic" | "bug";
type Ladder = Project["ladder"];

// Statuses each row renders in, by ladder, kind and scheduled-ness. Anything
// else is invisible.
const VISIBLE: Record<Ladder, Record<Kind, { unscheduled: TaskStatus[]; scheduled: TaskStatus[] }>> = {
  legacy: {
    story: {
      unscheduled: ["todo", "refining", "canceled", "ready_for_development"],
      scheduled: ["todo", "in_progress", "in_review", "canceled", "done"],
    },
    // Epics are on the Discovery board only; a scheduled epic renders nowhere.
    epic: { unscheduled: ["todo", "refining", "canceled", "ready_for_development"], scheduled: [] },
    // Not applicable: legacy bugs are never returned (asserted separately).
    bug: { unscheduled: [], scheduled: [] },
  },
  factory: {
    story: {
      unscheduled: ["backlog", "refining", "canceled", "ready"],
      scheduled: ["ready", "building", "integrated_tests", "tested", "user_testing", "canceled", "done"],
    },
    epic: { unscheduled: [], scheduled: [] },
    // A top-level bug is a Story on a Factory project (FB-52).
    bug: {
      unscheduled: ["backlog", "refining", "canceled", "ready"],
      scheduled: ["ready", "building", "integrated_tests", "tested", "user_testing", "canceled", "done"],
    },
  },
};

describe("invisibleStories: every status x sprint", () => {
  const cases: [Ladder, Kind][] = [
    ["legacy", "story"],
    ["legacy", "epic"],
    ["factory", "story"],
    ["factory", "bug"],
  ];
  for (const [ladder, kind] of cases) {
    for (const scheduled of [false, true]) {
      for (const status of ALL_STATUSES) {
        const visible = VISIBLE[ladder][kind][scheduled ? "scheduled" : "unscheduled"].includes(status);
        it(`${ladder} ${kind}, ${status}, ${scheduled ? "in a sprint" : "no sprint"}: ${visible ? "visible" : "invisible"}`, () => {
          const row = task({ type: kind, status, sprint_id: scheduled ? 7 : null });
          expect(invisibleStories([row], ladder)).toEqual(visible ? [] : [row]);
        });
      }
    }
  }
});

describe("invisibleStories: rows that are never returned", () => {
  const each = (fn: (status: TaskStatus, sprint: number | null) => void) => {
    for (const status of ALL_STATUSES) for (const sprint of [null, 7]) fn(status, sprint);
  };

  it("never returns a Factory epic", () => {
    each((status, sprint_id) => {
      expect(invisibleStories([task({ type: "epic", status, sprint_id })], "factory")).toEqual([]);
    });
  });

  it("never returns a subtask, on either ladder", () => {
    each((status, sprint_id) => {
      const row = task({ type: "subtask", status, sprint_id, parent_id: 99 });
      expect(invisibleStories([row], "legacy")).toEqual([]);
      expect(invisibleStories([row], "factory")).toEqual([]);
    });
  });

  it("never returns a bug Subtask on a Factory project", () => {
    each((status, sprint_id) => {
      expect(invisibleStories([task({ type: "bug", status, sprint_id, parent_id: 99 })], "factory")).toEqual([]);
    });
  });

  it("never returns a bug on a legacy project, top-level or not", () => {
    each((status, sprint_id) => {
      expect(invisibleStories([task({ type: "bug", status, sprint_id })], "legacy")).toEqual([]);
      expect(invisibleStories([task({ type: "bug", status, sprint_id, parent_id: 99 })], "legacy")).toEqual([]);
    });
  });

  it("treats a project not loaded yet like legacy", () => {
    const row = task({ type: "epic", status: "todo", sprint_id: 7 });
    expect(invisibleStories([row], undefined)).toEqual([row]);
  });
});

describe("invisibleStories: the live FB-93 cases", () => {
  it("reports legacy in_review/no sprint, ready_for_development/in sprint, done/no sprint and a done scheduled epic", () => {
    const rows = [
      task({ id: 1, status: "in_review", sprint_id: null }),
      task({ id: 2, status: "ready_for_development", sprint_id: 7 }),
      task({ id: 3, status: "done", sprint_id: null }),
      task({ id: 4, type: "epic", status: "done", sprint_id: 7 }),
      task({ id: 5, status: "in_progress", sprint_id: 7 }),
    ];
    expect(invisibleStories(rows, "legacy").map((t) => t.id)).toEqual([1, 2, 3, 4]);
  });
});
