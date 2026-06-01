import { describe, it, expect } from "vitest";
import { sortByPriority } from "@/features/boards/shared/boardConstants";
import type { TaskPriority } from "@/types";

const item = (id: number, priority: TaskPriority) => ({ id, priority });

describe("sortByPriority", () => {
  it("orders tasks highest priority first", () => {
    const sorted = sortByPriority([
      item(1, "low"),
      item(2, "critical"),
      item(3, "medium"),
      item(4, "high"),
    ]);
    expect(sorted.map((t) => t.priority)).toEqual([
      "critical",
      "high",
      "medium",
      "low",
    ]);
  });

  it("keeps incoming order for tasks of equal priority (stable sort)", () => {
    const sorted = sortByPriority([
      item(1, "medium"),
      item(2, "medium"),
      item(3, "medium"),
    ]);
    expect(sorted.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("does not mutate the input array", () => {
    const input = [item(1, "low"), item(2, "critical")];
    sortByPriority(input);
    expect(input.map((t) => t.id)).toEqual([1, 2]);
  });
});
