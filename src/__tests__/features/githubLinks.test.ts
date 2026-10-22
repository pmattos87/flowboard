import { describe, it, expect } from "vitest";
import { branchUrl, githubRepoUrl, prLabel } from "@/features/story/githubLinks";

const pr = (url: string) => ({ url, state: "merged", target: "develop" });

describe("githubLinks", () => {
  it("takes the repo from the first GitHub PR URL", () => {
    expect(githubRepoUrl([pr("https://example.com/x"), pr("https://github.com/pmattos87/flowboard/pull/77")]))
      .toBe("https://github.com/pmattos87/flowboard");
    expect(githubRepoUrl([])).toBeNull();
  });

  it("builds the branch page, keeping its slashes", () => {
    expect(branchUrl("https://github.com/o/r", "feat/FB-12-export#1"))
      .toBe("https://github.com/o/r/tree/feat/FB-12-export%231");
  });

  it("labels a PR by its number", () => {
    expect(prLabel(pr("https://github.com/o/r/pull/77"))).toBe("#77 · merged → develop");
    expect(prLabel(pr("https://example.com/x"))).toBe("https://example.com/x · merged → develop");
  });
});
