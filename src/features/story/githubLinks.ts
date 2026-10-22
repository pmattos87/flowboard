import type { StoryView } from "@/types";

// GitHub links on the Story page (SF-61). Flowboard records no repo per
// project, so the repo comes from the Story's PR URL; until a PR is opened the
// Feature branch has nothing to link to.

type Pr = StoryView["prs"][number];

const PR_URL = /^(https:\/\/github\.com\/[^/]+\/[^/]+)\/pull\/(\d+)/;

/** The repo's GitHub URL, e.g. https://github.com/o/r, from the first PR on GitHub. */
export function githubRepoUrl(prs: Pr[]): string | null {
  for (const pr of prs) {
    const m = PR_URL.exec(pr.url);
    if (m) return m[1];
  }
  return null;
}

export function branchUrl(repo: string, branch: string): string {
  return `${repo}/tree/${branch.split("/").map(encodeURIComponent).join("/")}`;
}

/** "#77 · merged → develop", or the raw URL when it is not a GitHub PR. */
export function prLabel(pr: Pr): string {
  const n = PR_URL.exec(pr.url)?.[2];
  return `${n ? `#${n}` : pr.url} · ${pr.state} → ${pr.target}`;
}
