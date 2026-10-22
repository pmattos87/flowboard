import type { TrailEvent } from "@/types";

// What the Story's trail says about each Subtask (SF-61): who it was last
// handed to, and its Verify rounds in order. The events are logged on the
// Story, each naming its Subtask by key.

export interface SubtaskRunInfo {
  agent: string | null;
  model: string | null;
  rounds: ("pass" | "fail")[];
}

function field(e: TrailEvent, name: string): string | null {
  if (typeof e.new !== "object") return null;
  const v = e.new[name];
  return typeof v === "string" ? v : null;
}

export function subtaskRunInfo(trail: TrailEvent[]): Record<string, SubtaskRunInfo> {
  const out: Record<string, SubtaskRunInfo> = {};
  const get = (key: string) => (out[key] ??= { agent: null, model: null, rounds: [] });
  for (const e of trail) {
    const key = field(e, "subtask");
    if (!key) continue;
    if (e.action === "subtask_handoff") {
      const info = get(key);
      info.agent = field(e, "agent");
      info.model = field(e, "model");
    } else if (e.action === "verify_round") {
      const result = field(e, "result");
      if (result === "pass" || result === "fail") get(key).rounds.push(result);
    }
  }
  return out;
}

/** A Subtask holds the stopped badge when the Run is stopped on its failed Verify. */
export function isSubtaskStopped(runStopped: boolean, info: SubtaskRunInfo | undefined): boolean {
  return runStopped && info?.rounds.at(-1) === "fail";
}
