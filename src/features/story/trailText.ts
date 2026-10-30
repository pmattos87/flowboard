import type { TrailEvent } from "@/types";

// One readable line per Run trail event (SF-62). The tone colours the line:
// stage moves, passes, failures and stops.

export type TrailTone = "stage" | "pass" | "fail" | "stop" | "info";

export interface TrailLine {
  tone: TrailTone;
  text: string;
  detail: string;
}

function field(e: TrailEvent, name: string): string {
  if (typeof e.new !== "object") return "";
  const v = e.new[name];
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}

const label = (status: string) => status.replace(/_/g, " ");

export function trailLine(e: TrailEvent): TrailLine {
  const f = (name: string) => field(e, name);
  const raw = typeof e.new === "string" ? e.new : "";
  switch (e.action) {
    case "created":
      return { tone: "stage", text: `Story created (${label(raw || "backlog")})`, detail: "" };
    case "stage_entered":
      return { tone: "stage", text: `Stage entered: ${label(raw)}`, detail: e.old ? `from ${label(e.old)}` : "" };
    case "status_changed":
      return { tone: "stage", text: `Status ${label(e.old)} → ${label(raw)}`, detail: "" };
    case "subtask_status_changed":
      return { tone: "info", text: `${f("subtask")} ${label(f("from"))} → ${label(f("to"))}`, detail: "" };
    case "subtask_handoff":
      return { tone: "info", text: `${f("subtask")} handed to ${f("agent")} · ${f("model")}`, detail: "" };
    case "verify_round": {
      const pass = f("result") === "pass";
      return { tone: pass ? "pass" : "fail", text: `Verify r${f("round")} ${pass ? "✓" : "✗"} ${f("subtask")}`, detail: f("reason") };
    }
    case "verify_started":
      return { tone: "info", text: `${f("subtask")} Verify r${f("round")} started`, detail: "" };
    case "review_round": {
      const pass = f("verdict") === "passed";
      const commit = f("commit").slice(0, 7);
      return { tone: pass ? "pass" : "fail", text: `Review r${f("round")} ${pass ? "passed" : "failed"}`, detail: commit ? `at ${commit}` : "" };
    }
    case "review_started":
      return { tone: "info", text: `Review r${f("round")} started`, detail: "" };
    case "run_stopped":
      return { tone: "stop", text: "Run stopped", detail: f("reason") };
    case "run_restarted":
      return { tone: "stage", text: "Run restarted", detail: "" };
    case "pr_opened":
      return { tone: "info", text: `PR opened → ${f("target")}`, detail: f("url") };
    case "pr_merged":
      return { tone: "pass", text: "PR merged", detail: f("url") };
    case "release_picked":
      return { tone: "info", text: `Picked into Release ${f("version")}`, detail: "" };
    case "release_removed":
      return { tone: "info", text: `Removed from Release ${f("version")}`, detail: "" };
    case "bug_subtask_filed":
      return { tone: "fail", text: `Bug Subtask filed: ${f("subtask")}`, detail: f("title") };
    default:
      return { tone: "info", text: label(e.action), detail: raw };
  }
}
