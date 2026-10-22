import { describe, it, expect } from "vitest";
import { isSubtaskStopped, subtaskRunInfo } from "@/features/story/subtaskRun";
import type { TrailEvent } from "@/types";

const ev = (action: string, data: Record<string, unknown> | string): TrailEvent => ({
  at: "", action, old: "", new: data, by: "Claude",
});

describe("subtaskRunInfo", () => {
  it("keeps the latest handoff and every Verify round in order", () => {
    const info = subtaskRunInfo([
      ev("created", "backlog"),
      ev("subtask_handoff", { subtask: "FB-2", agent: "implementer", model: "sonnet" }),
      ev("verify_round", { subtask: "FB-2", round: 1, result: "fail", reason: "tsc" }),
      ev("subtask_handoff", { subtask: "FB-2", agent: "orchestrator", model: "opus" }),
      ev("verify_round", { subtask: "FB-2", round: 2, result: "pass", reason: "" }),
      ev("verify_round", { subtask: "FB-3", round: 1, result: "fail", reason: "lint" }),
    ]);
    expect(info["FB-2"]).toEqual({ agent: "orchestrator", model: "opus", rounds: ["fail", "pass"] });
    expect(info["FB-3"]).toEqual({ agent: null, model: null, rounds: ["fail"] });
  });

  it("ignores events that name no Subtask", () => {
    expect(subtaskRunInfo([ev("run_stopped", { reason: "x" }), ev("stage_entered", "building")])).toEqual({});
  });
});

describe("isSubtaskStopped", () => {
  it("is true only when the Run is stopped and the last round failed", () => {
    expect(isSubtaskStopped(true, { agent: null, model: null, rounds: ["pass", "fail"] })).toBe(true);
    expect(isSubtaskStopped(true, { agent: null, model: null, rounds: ["fail", "pass"] })).toBe(false);
    expect(isSubtaskStopped(false, { agent: null, model: null, rounds: ["fail"] })).toBe(false);
    expect(isSubtaskStopped(true, undefined)).toBe(false);
  });
});
