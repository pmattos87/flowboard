import { describe, it, expect } from "vitest";
import { trailLine } from "@/features/story/trailText";
import type { TrailEvent } from "@/types";

const ev = (action: string, data: Record<string, unknown> | string, old = ""): TrailEvent => ({
  at: "", action, old, new: data, by: "Claude",
});

describe("trailLine", () => {
  it("describes every event kind the CLI writes", () => {
    expect(trailLine(ev("created", "backlog")).text).toBe("Story created (backlog)");
    expect(trailLine(ev("stage_entered", "integrated_tests", "building"))).toEqual({
      tone: "stage", text: "Stage entered: integrated tests", detail: "from building",
    });
    expect(trailLine(ev("subtask_status_changed", { subtask: "FB-2", from: "todo", to: "in_progress" })).text)
      .toBe("FB-2 todo → in progress");
    expect(trailLine(ev("subtask_handoff", { subtask: "FB-2", agent: "implementer", model: "sonnet" })).text)
      .toBe("FB-2 handed to implementer · sonnet");
    expect(trailLine(ev("verify_round", { subtask: "FB-2", round: 2, result: "fail", reason: "tsc" }))).toEqual({
      tone: "fail", text: "Verify r2 ✗ FB-2", detail: "tsc",
    });
    expect(trailLine(ev("review_round", { round: 1, verdict: "passed", commit: "d682b4d6773a" }))).toEqual({
      tone: "pass", text: "Review r1 passed", detail: "at d682b4d",
    });
    expect(trailLine(ev("run_stopped", { reason: "Verify failed twice" }))).toEqual({
      tone: "stop", text: "Run stopped", detail: "Verify failed twice",
    });
    expect(trailLine(ev("run_restarted", "")).text).toBe("Run restarted");
    expect(trailLine(ev("pr_opened", { url: "u", target: "develop" })).text).toBe("PR opened → develop");
    expect(trailLine(ev("pr_merged", { url: "u" })).tone).toBe("pass");
    expect(trailLine(ev("release_picked", { version: "1.6.0", warnings: [] })).text).toBe("Picked into Release 1.6.0");
    expect(trailLine(ev("release_removed", { version: "1.6.0" })).text).toBe("Removed from Release 1.6.0");
    expect(trailLine(ev("bug_subtask_filed", { subtask: "FB-9", title: "Review round 1 findings" }))).toEqual({
      tone: "fail", text: "Bug Subtask filed: FB-9", detail: "Review round 1 findings",
    });
  });

  it("falls back to the action name for unknown kinds", () => {
    expect(trailLine(ev("something_new", "x"))).toEqual({ tone: "info", text: "something new", detail: "x" });
  });
});
