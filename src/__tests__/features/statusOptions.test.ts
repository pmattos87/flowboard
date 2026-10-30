import { describe, it, expect } from "vitest";
import { statusOptionsForType } from "@/features/boards/shared/boardConstants";

// FB-85: the discovery statuses ("refining", "ready_for_development") are part of
// the story lifecycle and must only be offered for stories & epics.
describe("statusOptionsForType", () => {
  it("offers the discovery statuses for stories and epics", () => {
    for (const type of ["story", "epic"] as const) {
      const values = statusOptionsForType({ type, parent_id: null }).map((o) => o.value);
      expect(values).toContain("refining");
      expect(values).toContain("ready_for_development");
      expect(values).toHaveLength(7);
    }
  });

  it("keeps the plain dev workflow for tasks and bugs", () => {
    for (const type of ["subtask", "bug"] as const) {
      const values = statusOptionsForType({ type, parent_id: null }).map((o) => o.value);
      expect(values).not.toContain("refining");
      expect(values).not.toContain("ready_for_development");
      expect(values).toEqual(["todo", "in_progress", "in_review", "canceled", "done"]);
    }
  });

  // FB-224: a Factory epic has its own small lifecycle, never the Story ladder.
  it("offers a Factory epic exactly todo, done and canceled", () => {
    const values = statusOptionsForType({ type: "epic", parent_id: null }, "factory").map((o) => o.value);
    expect([...values].sort()).toEqual(["canceled", "done", "todo"]);
  });

  it("leaves legacy epic options unchanged", () => {
    const values = statusOptionsForType({ type: "epic", parent_id: null }, "legacy").map((o) => o.value);
    expect(values).toEqual(["todo", "refining", "ready_for_development", "in_progress", "in_review", "canceled", "done"]);
  });
});
