import { describe, it, expect } from "vitest";
import {
  PX_PER_DAY,
  addDays,
  daysBetween,
  dateToPx,
  pxToDays,
  snapPxToDay,
  originForScale,
  monthsBetween,
  weeksBetween,
  quartersBetween,
  formatMonthLabel,
  formatQuarterLabel,
} from "@/features/roadmap/utils/dateMath";

describe("addDays", () => {
  it("adds positive days", () => {
    expect(addDays("2026-01-01", 6)).toBe("2026-01-07");
  });
  it("subtracts with negative input", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("handles month rollover", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });
  it("handles leap year (2024)", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
  });
  it("handles year rollover", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("daysBetween", () => {
  it("returns exclusive day count", () => {
    expect(daysBetween("2026-01-01", "2026-01-07")).toBe(6);
  });
  it("returns 0 for same date", () => {
    expect(daysBetween("2026-05-26", "2026-05-26")).toBe(0);
  });
  it("returns negative for reversed args", () => {
    expect(daysBetween("2026-01-07", "2026-01-01")).toBe(-6);
  });
});

describe("dateToPx / pxToDays round-trip", () => {
  it("round-trips at each scale", () => {
    const origin = "2026-01-01";
    for (const scale of ["week", "month", "quarter"] as const) {
      const target = "2026-02-15";
      const px = dateToPx(target, origin, scale);
      const days = pxToDays(px, scale);
      expect(days).toBe(daysBetween(origin, target));
      // daysBetween → addDays produces the original target
      expect(addDays(origin, days)).toBe(target);
    }
  });
});

describe("snapPxToDay", () => {
  it("snaps pixel deltas to whole-day increments", () => {
    expect(snapPxToDay(35, "week")).toBe(32); // 1.09 days → 1 day → 32px
    expect(snapPxToDay(47, "week")).toBe(32); // 1.47 days → 1 day → 32px
    expect(snapPxToDay(48, "week")).toBe(64); // 1.5 days → Math.round = 2 days → 64px
    expect(snapPxToDay(-35, "week")).toBe(-32);
  });
  it("works at all scales", () => {
    expect(snapPxToDay(PX_PER_DAY.month * 3 + 1, "month")).toBe(PX_PER_DAY.month * 3);
    expect(snapPxToDay(PX_PER_DAY.quarter * 7, "quarter")).toBe(PX_PER_DAY.quarter * 7);
  });
});

describe("originForScale", () => {
  it("snaps week origin to Monday", () => {
    // 2026-05-26 is a Tuesday → Monday is 2026-05-25
    expect(originForScale("2026-05-26", "week")).toBe("2026-05-25");
    // Sunday 2026-05-31 → previous Monday 2026-05-25
    expect(originForScale("2026-05-31", "week")).toBe("2026-05-25");
    // Monday stays put
    expect(originForScale("2026-05-25", "week")).toBe("2026-05-25");
  });
  it("snaps month origin to the 1st", () => {
    expect(originForScale("2026-05-26", "month")).toBe("2026-05-01");
    expect(originForScale("2026-05-01", "month")).toBe("2026-05-01");
  });
  it("snaps quarter origin to Jan/Apr/Jul/Oct 1st", () => {
    expect(originForScale("2026-05-26", "quarter")).toBe("2026-04-01");
    expect(originForScale("2026-02-15", "quarter")).toBe("2026-01-01");
    expect(originForScale("2026-08-01", "quarter")).toBe("2026-07-01");
    expect(originForScale("2026-11-30", "quarter")).toBe("2026-10-01");
  });
});

describe("monthsBetween / weeksBetween / quartersBetween", () => {
  it("enumerates month-starts in range", () => {
    const months = monthsBetween("2026-01-15", "2026-04-10");
    expect(months).toEqual(["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]);
  });
  it("enumerates Monday-starts in range", () => {
    const weeks = weeksBetween("2026-05-25", "2026-06-15");
    expect(weeks[0]).toBe("2026-05-25"); // Monday
    expect(weeks.every((w, i) => i === 0 || daysBetween(weeks[i - 1], w) === 7)).toBe(true);
  });
  it("enumerates quarter-starts in range", () => {
    const quarters = quartersBetween("2026-02-15", "2026-09-30");
    expect(quarters).toEqual(["2026-01-01", "2026-04-01", "2026-07-01"]);
  });
});

describe("label formatters", () => {
  it("formats month labels with the year (locale-agnostic)", () => {
    const label = formatMonthLabel("2026-05-01");
    expect(label).toContain("2026");
    expect(label.length).toBeGreaterThan(4);
  });
  it("formats quarter labels", () => {
    expect(formatQuarterLabel("2026-01-01")).toBe("Q1 2026");
    expect(formatQuarterLabel("2026-04-01")).toBe("Q2 2026");
    expect(formatQuarterLabel("2026-07-01")).toBe("Q3 2026");
    expect(formatQuarterLabel("2026-10-01")).toBe("Q4 2026");
  });
});
