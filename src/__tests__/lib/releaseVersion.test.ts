import { describe, it, expect } from "vitest";
import { lastReleasedVersion, suggestVersion } from "@/lib/releaseVersion";
import type { ReleaseSummary } from "@/types";

const rel = (version: string, state: ReleaseSummary["state"]): ReleaseSummary => ({
  version, state, created_at: "2026-01-01T00:00:00.000Z", released_at: null, stories: 0,
});

describe("lastReleasedVersion", () => {
  it("takes the highest released version, comparing numerically", () => {
    expect(lastReleasedVersion([rel("1.9.0", "released"), rel("1.10.0", "released"), rel("2.0.0", "planned")])).toBe("1.10.0");
  });

  it("ignores Releases that never shipped", () => {
    expect(lastReleasedVersion([rel("1.6.0", "planned"), rel("1.7.0", "canceled")])).toBeNull();
  });
});

describe("suggestVersion", () => {
  const released = [rel("1.5.1", "released")];

  it("bumps the minor when any picked branch is a feat", () => {
    expect(suggestVersion(released, ["fix/FB-1-x", "feat/FB-2-y"])).toBe("1.6.0");
  });

  it("bumps the patch when no picked branch is a feat", () => {
    expect(suggestVersion(released, ["fix/FB-1-x", "chore/FB-3-z", null])).toBe("1.5.2");
    expect(suggestVersion(released, [])).toBe("1.5.2");
  });

  it("suggests nothing before the first release", () => {
    expect(suggestVersion([], ["feat/FB-2-y"])).toBeNull();
  });
});
