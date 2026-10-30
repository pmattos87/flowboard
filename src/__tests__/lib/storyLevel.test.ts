import { describe, it, expect } from "vitest";
import { isStoryLevel } from "@/lib/storyLevel";
import { statusOptionsForType } from "@/features/boards/shared/boardConstants";
import {
  buildSprintBoardRows,
  computeSprintDropPayload,
  isSprintScheduleBlocked,
} from "@/features/boards/shared/sprintBoardGrouping";
import { sprintCompletion } from "@/lib/sprintProgress";
import { backlogBlockReason } from "@/lib/sprintCompletion";
import { reportedTasks } from "@/features/reports/reportedTasks";
import { openBugCount, storyPagePath } from "@/features/story/useStoryCardDecor";
import type { Project, Sprint, Task } from "@/types";

// FB-52: on a Factory project a top-level bug is a Story (a fix); a bug with a
// parent stays a bug Subtask. Legacy projects keep `type === "story"`.

function task(over: Partial<Task>): Task {
  return {
    id: 1, project_id: 1, task_number: 1, sprint_id: null, parent_id: null,
    title: "", description: "", type: "story", status: "backlog", priority: "medium",
    assignee_id: null, story_points: 0, due_date: null, created_at: "", updated_at: "",
    labels: "", feature_branch: null, review_verdict: null, reviewed_commit: null,
    findings_url: null, run_stopped: false, risk: false, release_id: null,
    ...over,
  };
}

function project(ladder: Project["ladder"]): Project {
  return {
    id: 1, name: "Flowboard", key: "FB", description: "", color: "#6366f1", created_at: "",
    logo_data: null, position: 0, ladder, kind: "internal",
  };
}

const sprint: Sprint = {
  id: 7, project_id: 1, name: "Sprint 7", goal: "", start_date: "2024-01-01", end_date: "2024-01-14", status: "active",
};

const FACTORY_STORY = ["backlog", "refining", "ready", "building", "integrated_tests", "tested", "user_testing", "canceled", "done"];
const FACTORY_SUBTASK = ["todo", "in_progress", "canceled", "done"];
const DEV = ["todo", "in_progress", "in_review", "canceled", "done"];

describe("isStoryLevel", () => {
  it("on a Factory project, is true for a top-level story or bug only", () => {
    expect(isStoryLevel({ type: "story", parent_id: null }, "factory")).toBe(true);
    expect(isStoryLevel({ type: "bug", parent_id: null }, "factory")).toBe(true);
    expect(isStoryLevel({ type: "bug", parent_id: 1 }, "factory")).toBe(false);
    expect(isStoryLevel({ type: "subtask", parent_id: 1 }, "factory")).toBe(false);
    expect(isStoryLevel({ type: "epic", parent_id: null }, "factory")).toBe(false);
  });

  it("on a legacy project, keeps type === story", () => {
    expect(isStoryLevel({ type: "story", parent_id: null }, "legacy")).toBe(true);
    expect(isStoryLevel({ type: "bug", parent_id: null }, "legacy")).toBe(false);
    expect(isStoryLevel({ type: "bug", parent_id: null }, undefined)).toBe(false);
  });
});

describe("statusOptionsForType learns the parent", () => {
  const values = (t: Pick<Task, "type" | "parent_id">, ladder: Project["ladder"]) =>
    statusOptionsForType(t, ladder).map((o) => o.value);

  it("gives a Factory top-level bug the Story ladder and a bug Subtask the Subtask ladder", () => {
    expect(values({ type: "bug", parent_id: null }, "factory")).toEqual(FACTORY_STORY);
    expect(values({ type: "bug", parent_id: 1 }, "factory")).toEqual(FACTORY_SUBTASK);
  });

  it("keeps the dev statuses for a legacy top-level bug", () => {
    expect(values({ type: "bug", parent_id: null }, "legacy")).toEqual(DEV);
  });
});

describe("Sprint Planning with a bug Story", () => {
  it("lists a Factory bug Story at ready with no sprint in the backlog row", () => {
    const bug = task({ id: 2, type: "bug", status: "ready" });
    const rows = buildSprintBoardRows([bug], [], "all", "factory");
    expect(rows.find((r) => r.key === "backlog")?.tasks.map((t) => t.id)).toEqual([2]);
  });

  it("excludes a Factory bug Subtask", () => {
    const bug = task({ id: 2, type: "bug", status: "ready", parent_id: 1 });
    expect(buildSprintBoardRows([bug], [], "all", "factory")[0].tasks).toEqual([]);
  });

  it("gives a Factory bug Story the same drop payload as a Factory Story", () => {
    for (const [status, sprint_id, target] of [
      ["ready", null, 7],
      ["ready", 7, "backlog"],
      ["building", 7, 8],
    ] as const) {
      const s = task({ type: "story", status, sprint_id });
      const b = task({ type: "bug", status, sprint_id });
      expect(computeSprintDropPayload(b, target, "factory")).toEqual(computeSprintDropPayload(s, target, "factory"));
    }
    expect(computeSprintDropPayload(task({ type: "bug", status: "ready" }), 7, "factory")?.payload).toEqual({ sprint_id: 7 });
  });

  it("blocks a Factory bug Story at refining from a sprint, like a Story", () => {
    for (const status of ["backlog", "refining", "ready"] as const) {
      const s = task({ type: "story", status });
      const b = task({ type: "bug", status });
      expect(isSprintScheduleBlocked(b, 7, "factory")).toBe(isSprintScheduleBlocked(s, 7, "factory"));
    }
    expect(isSprintScheduleBlocked(task({ type: "bug", status: "refining" }), 7, "factory")).toBe(true);
    expect(isSprintScheduleBlocked(task({ type: "bug", status: "ready" }), 7, "factory")).toBe(false);
  });

  it("never blocks a Factory bug Subtask", () => {
    expect(isSprintScheduleBlocked(task({ type: "bug", status: "todo", parent_id: 1 }), 7, "factory")).toBe(false);
  });

  it("legacy: a top-level bug at todo is not blocked and keeps its status", () => {
    const bug = task({ type: "bug", status: "todo" });
    expect(isSprintScheduleBlocked(bug, 7, "legacy")).toBe(false);
    expect(computeSprintDropPayload(bug, 7, "legacy")?.payload).toEqual({ sprint_id: 7 });
    expect(computeSprintDropPayload({ ...bug, sprint_id: 7 }, "backlog", "legacy")?.payload).toEqual({ sprint_id: null });
  });
});

describe("progress and reports count bug Stories", () => {
  const bugStory = task({ id: 1, type: "bug", status: "done", story_points: 3, sprint_id: 7 });
  const bugSubtask = task({ id: 2, type: "bug", status: "done", story_points: 5, parent_id: 1, sprint_id: 7 });
  const story = task({ id: 3, type: "story", status: "building", story_points: 1, sprint_id: 7 });

  it("sprintCompletion counts a Factory bug Story's points but not a bug Subtask's", () => {
    const r = sprintCompletion([bugStory, bugSubtask, story], "factory");
    expect([r.donePoints, r.totalPoints]).toEqual([3, 4]);
  });

  it("sprintCompletion on a legacy project still counts stories only", () => {
    const r = sprintCompletion([bugStory, story], "legacy");
    expect([r.donePoints, r.totalPoints]).toEqual([0, 1]);
  });

  it("reportedTasks on a Factory project includes bug Stories and excludes bug Subtasks", () => {
    expect(reportedTasks([bugStory, bugSubtask, story], "factory").map((t) => t.id)).toEqual([1, 3]);
  });

  it("backlogBlockReason names a Factory bug Story not at ready", () => {
    const b = task({ id: 1, task_number: 4, type: "bug", status: "building", sprint_id: 7 });
    expect(backlogBlockReason(project("factory"), [b], sprint.id)).toContain("FB-4 is building");
  });
});

describe("Story page routing for a bug Story", () => {
  const bugStory = task({ id: 1, task_number: 9, type: "bug", status: "building" });

  it("storyPagePath routes a Factory bug Story to its page", () => {
    expect(storyPagePath(project("factory"), bugStory)).toBe("/story/FB-9");
    expect(storyPagePath(project("factory"), task({ type: "bug", parent_id: 1 }))).toBeNull();
    expect(storyPagePath(project("legacy"), bugStory)).toBeNull();
  });

  it("openBugCount still counts only bug children", () => {
    const tasks = [
      bugStory,
      task({ id: 2, type: "bug", status: "todo", parent_id: 1 }),
      task({ id: 3, type: "subtask", status: "todo", parent_id: 1 }),
      task({ id: 4, type: "bug", status: "todo" }),
    ];
    expect(openBugCount(bugStory, tasks)).toBe(1);
  });
});
