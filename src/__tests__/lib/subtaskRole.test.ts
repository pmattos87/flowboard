import { describe, it, expect } from "vitest";
import { subtaskRole } from "@/lib/subtaskRole";
import type { Task } from "@/types";

const row = (over: Partial<Pick<Task, "type" | "title" | "description">>): Pick<Task, "type" | "title" | "description"> => ({
  type: "subtask", title: "Add the parser", description: "", ...over,
});

describe("subtaskRole", () => {
  it("gives bug for a bug row", () => {
    expect(subtaskRole(row({ type: "bug", title: "Review round 1 findings" }))).toBe("bug");
  });

  it("gives simplify for a Subtask titled exactly Simplify", () => {
    expect(subtaskRole(row({ title: "Simplify" }))).toBe("simplify");
  });

  it("gives simplify for a Subtask whose description starts with agent: simplify", () => {
    expect(subtaskRole(row({ title: "Clean up", description: "  agent: simplify\nSimplify the Story's code." }))).toBe("simplify");
  });

  it("gives subtask for a Subtask whose title only starts with Simplify", () => {
    expect(subtaskRole(row({ title: "Simplify the parser" }))).toBe("subtask");
  });

  it("does not give simplify for a Story titled Simplify", () => {
    expect(subtaskRole(row({ type: "story", title: "Simplify" }))).not.toBe("simplify");
  });
});

describe("subtaskRole — rule edges (QA)", () => {
  it("is case-sensitive on the description marker", () => {
    expect(subtaskRole(row({ description: "Agent: simplify" }))).toBe("subtask");
    expect(subtaskRole(row({ description: "agent: Simplify" }))).toBe("subtask");
  });

  it("needs the marker at the start, after leading whitespace only", () => {
    expect(subtaskRole(row({ description: "\n\t agent: simplify" }))).toBe("simplify");
    expect(subtaskRole(row({ description: "Notes\nagent: simplify" }))).toBe("subtask");
  });

  it("needs the title to be exactly Simplify", () => {
    expect(subtaskRole(row({ title: "simplify" }))).toBe("subtask");
    expect(subtaskRole(row({ title: " Simplify" }))).toBe("subtask");
  });

  it("keeps a bug titled Simplify a bug, and never simplifies a Story or Epic by description", () => {
    expect(subtaskRole(row({ type: "bug", title: "Simplify" }))).toBe("bug");
    expect(subtaskRole(row({ type: "story", description: "agent: simplify" }))).toBe("subtask");
    expect(subtaskRole(row({ type: "epic", title: "Simplify" }))).toBe("subtask");
  });
});
