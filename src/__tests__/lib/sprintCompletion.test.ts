import { describe, it, expect } from "vitest";
import {
  backlogBlockReason,
  daysOverdue,
  isUnfinished,
  nextSprint,
  openSubtasksUnderDoneStories,
} from "@/lib/sprintCompletion";
import type { Sprint, SprintStatus, Task, TaskStatus, TaskType } from "@/types";

const sprint = (id: number, start_date: string, status: SprintStatus = "backlog", project_id = 1): Sprint => ({
  id, project_id, name: `S${id}`, goal: "", start_date, end_date: start_date, status,
});

type Row = Pick<Task, "id" | "sprint_id" | "parent_id" | "type" | "status" | "task_number">;
const row = (
  id: number,
  type: TaskType,
  status: TaskStatus,
  sprint_id: number | null = 1,
  parent_id: number | null = null,
): Row => ({ id, task_number: id, type, status, sprint_id, parent_id });

describe("isUnfinished", () => {
  it("is false for done and canceled", () => {
    expect(isUnfinished("done")).toBe(false);
    expect(isUnfinished("canceled")).toBe(false);
  });

  it("is true for tested, user_testing and the rest", () => {
    for (const s of ["tested", "user_testing", "integrated_tests", "ready", "todo", "in_review"] as const) {
      expect(isUnfinished(s)).toBe(true);
    }
  });
});

describe("nextSprint", () => {
  const source = sprint(1, "2026-10-01", "active");

  it("picks the earliest start_date, skipping the source and completed sprints", () => {
    const sprints = [
      source,
      sprint(2, "2026-09-01", "completed"),
      sprint(3, "2026-11-15"),
      sprint(4, "2026-10-15", "active"),
    ];
    expect(nextSprint(sprints, source)?.id).toBe(4);
  });

  it("ignores sprints of another project", () => {
    expect(nextSprint([source, sprint(5, "2026-10-02", "backlog", 2)], source)).toBeNull();
  });

  it("returns null when no sprint is left", () => {
    expect(nextSprint([source, sprint(2, "2026-11-01", "completed")], source)).toBeNull();
    expect(nextSprint([], source)).toBeNull();
  });
});

describe("daysOverdue", () => {
  const today = new Date(2026, 9, 28, 15, 30); // 2026-10-28, local afternoon

  it("is 0 for an end date of today or later", () => {
    expect(daysOverdue("2026-10-28", today)).toBe(0);
    expect(daysOverdue("2026-10-29", today)).toBe(0);
    expect(daysOverdue("2027-01-01", today)).toBe(0);
  });

  it("is N for an end date N calendar days ago", () => {
    expect(daysOverdue("2026-10-27", today)).toBe(1);
    expect(daysOverdue("2026-10-25", today)).toBe(3);
    expect(daysOverdue("2026-10-09", today)).toBe(19);
  });

  it("counts calendar days, not elapsed hours, just after midnight", () => {
    expect(daysOverdue("2026-10-27", new Date(2026, 9, 28, 0, 5))).toBe(1);
  });
});

describe("backlogBlockReason", () => {
  const factory = { key: "FB", ladder: "factory" as const };
  const legacy = { key: "HL", ladder: "legacy" as const };

  it("is null on a legacy project whatever the statuses", () => {
    expect(backlogBlockReason(legacy, [row(1, "story", "in_progress")], 1)).toBeNull();
  });

  it("is null on a Factory project when every unfinished Story is at ready", () => {
    const tasks = [
      row(1, "story", "ready"),
      row(2, "story", "done"),
      row(3, "story", "canceled"),
      row(4, "subtask", "building", 1, 1), // a Subtask follows its Story; not checked on its own
      row(5, "bug", "in_progress"), // top-level bugs move with sprint_id alone
      row(6, "story", "building", 2), // another sprint
    ];
    expect(backlogBlockReason(factory, tasks, 1)).toBeNull();
  });

  it("names every unfinished Story past ready on a Factory project", () => {
    const tasks = [row(1, "story", "ready"), row(7, "story", "building"), row(9, "story", "tested")];
    expect(backlogBlockReason(factory, tasks, 1)).toBe(
      "a Story enters or leaves a sprint only at ready; FB-7 is building, FB-9 is tested",
    );
  });
});

describe("openSubtasksUnderDoneStories", () => {
  it("returns each done Story with its unfinished Subtasks", () => {
    const tasks = [
      row(1, "story", "done"),
      row(2, "subtask", "todo", 1, 1),
      row(3, "subtask", "done", 1, 1),
      row(4, "subtask", "in_progress", 2, 1), // a child in another sprint still counts
      row(5, "story", "done"),
      row(6, "subtask", "canceled", 1, 5),
      row(7, "story", "in_progress"),
      row(8, "subtask", "todo", 1, 7), // parent not done
      row(10, "story", "done"),
      row(11, "subtask", "in_review", 1, 10),
    ];
    expect(openSubtasksUnderDoneStories("HL", tasks, 1)).toEqual([
      { story: "HL-1", subtasks: ["HL-2", "HL-4"] },
      { story: "HL-10", subtasks: ["HL-11"] },
    ]);
  });

  it("returns nothing when every child of a done Story is closed", () => {
    const tasks = [
      row(1, "story", "done"),
      row(2, "subtask", "done", 1, 1),
      row(3, "subtask", "canceled", 1, 1),
    ];
    expect(openSubtasksUnderDoneStories("HL", tasks, 1)).toEqual([]);
  });

  it("ignores done Stories of another sprint", () => {
    const tasks = [row(1, "story", "done", 2), row(2, "subtask", "todo", 1, 1)];
    expect(openSubtasksUnderDoneStories("HL", tasks, 1)).toEqual([]);
  });
});
