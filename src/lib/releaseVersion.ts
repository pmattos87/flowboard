import type { ReleaseSummary } from "@/types";

type Semver = [number, number, number];

function parse(version: string): Semver | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compare(a: Semver, b: Semver): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** The highest version among the project's released Releases, or null. */
export function lastReleasedVersion(releases: ReleaseSummary[]): string | null {
  let best: Semver | null = null;
  for (const r of releases) {
    const v = r.state === "released" ? parse(r.version) : null;
    if (v && (!best || compare(v, best) > 0)) best = v;
  }
  return best ? best.join(".") : null;
}

/**
 * The version to suggest for a new Release: the last released version bumped
 * by the picked branches' types — any `feat/` branch bumps the minor, anything
 * else the patch. Null when nothing has been released yet (nothing to bump).
 */
export function suggestVersion(releases: ReleaseSummary[], branches: (string | null)[]): string | null {
  const last = lastReleasedVersion(releases);
  if (!last) return null;
  const [major, minor, patch] = parse(last) as Semver;
  const feature = branches.some((b) => b?.startsWith("feat/"));
  return feature ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}
