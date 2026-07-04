import { describe, it, expect } from "vitest";
import { statusOptionsForType } from "@/features/boards/shared/boardConstants";

// FB-85: the discovery statuses ("refining", "ready_for_development") are part of
// the story lifecycle and must only be offered for stories & epics.
describe("statusOptionsForType", () => {
  it("offers the discovery statuses for stories and epics", () => {
    for (const type of ["story", "epic"] as const) {
      const values = statusOptionsForType(type).map((o) => o.value);
      expect(values).toContain("refining");
      expect(values).toContain("ready_for_development");
      expect(values).toHaveLength(7);
    }
  });

  it("keeps the plain dev workflow for tasks and bugs", () => {
    for (const type of ["task", "bug"] as const) {
      const values = statusOptionsForType(type).map((o) => o.value);
      expect(values).not.toContain("refining");
      expect(values).not.toContain("ready_for_development");
      expect(values).toEqual(["todo", "in_progress", "in_review", "canceled", "done"]);
    }
  });
});
