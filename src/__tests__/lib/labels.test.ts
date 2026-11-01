import { describe, it, expect } from "vitest";
import { parseLabels, matchesLabelFilter } from "@/lib/labels";

describe("parseLabels", () => {
  it("returns [] for an empty or missing string", () => {
    expect(parseLabels("")).toEqual([]);
    expect(parseLabels(null)).toEqual([]);
    expect(parseLabels(undefined)).toEqual([]);
  });

  it("splits on commas, trims and drops empties, keeping case and inner spaces", () => {
    expect(parseLabels(" qa, Phase 1 ,,QA")).toEqual(["qa", "Phase 1", "QA"]);
  });
});

describe("matchesLabelFilter", () => {
  const tasks = [{ labels: "" }, { labels: "qa,tooling" }, { labels: "Phase 1,ux" }, { labels: "QA" }];

  it("matches every task when the filter is null", () => {
    expect(tasks.every((t) => matchesLabelFilter(t, null))).toBe(true);
  });

  it("matches only tasks whose parsed labels contain that exact label", () => {
    expect(tasks.filter((t) => matchesLabelFilter(t, "qa"))).toEqual([{ labels: "qa,tooling" }]);
    expect(tasks.filter((t) => matchesLabelFilter(t, "Phase 1"))).toEqual([{ labels: "Phase 1,ux" }]);
  });

  it("does not match on case, substrings or the raw string", () => {
    expect(matchesLabelFilter({ labels: "QA" }, "qa")).toBe(false);
    expect(matchesLabelFilter({ labels: "tooling" }, "tool")).toBe(false);
    expect(matchesLabelFilter({ labels: "qa,tooling" }, "qa,tooling")).toBe(false);
  });
});
