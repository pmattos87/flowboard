import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { RunGraphView, RunLegend, edgeStyle, layoutRunGraph } from "@/features/story/RunGraphView";
import { runGraph } from "@/features/story/runGraph";
import type { Task, TrailEvent } from "@/types";

function task(over: Partial<Task>): Task {
  return {
    id: 1, project_id: 1, task_number: 1, sprint_id: 3, parent_id: null,
    title: "", description: "", type: "story", status: "building", priority: "medium",
    assignee_id: null, story_points: 0, due_date: null, created_at: "", updated_at: "",
    labels: "", feature_branch: null, review_verdict: null, reviewed_commit: null,
    findings_url: null, run_stopped: true, risk: false, release_id: null,
    ...over,
  };
}

const ev = (action: string, data: Record<string, unknown> | string): TrailEvent => ({ at: "", action, old: "", new: data, by: "" });

describe("RunGraphView", () => {
  it("draws one node per Subtask with its agent and rounds, and each node's state", () => {
    const graph = runGraph({
      story: task({}),
      subtasks: [
        task({ id: 2, task_number: 2, parent_id: 1, type: "subtask", status: "done", title: "Template layout" }),
        task({ id: 3, task_number: 3, parent_id: 1, type: "subtask", status: "in_progress", title: "Signature block" }),
      ],
      trail: [
        ev("stage_entered", "building"),
        ev("subtask_handoff", { subtask: "FB-3", agent: "implementer", model: "sonnet" }),
        ev("verify_round", { subtask: "FB-3", round: 1, result: "fail" }),
        ev("run_stopped", { reason: "Verify failed twice" }),
      ],
      projectKey: "FB",
      clientProject: false,
    });
    const { container } = render(<RunGraphView graph={graph} />);
    expect(screen.getByText("Template layout")).toBeInTheDocument();
    expect(screen.getByText("implementer · sonnet")).toBeInTheDocument();
    expect(screen.getByText("r1✗")).toBeInTheDocument();
    const state = (id: string) => container.querySelector(`[data-node="${id}"]`)?.getAttribute("data-state");
    expect(state("sub-2")).toBe("done");
    expect(state("sub-3")).toBe("stopped");
    expect(state("stop")).toBe("stopped");
    expect(state("production")).toBe("todo");
    expect(screen.getByText("PLAN")).toBeInTheDocument();
    expect(screen.queryByText("User testing")).not.toBeInTheDocument();
  });

  it("gives stage and ship node titles a tooltip with the full text and wraps instead of truncating", () => {
    const graph = runGraph({ story: task({}), subtasks: [], trail: [], projectKey: "FB", clientProject: false });
    render(<RunGraphView graph={graph} />);
    const title = screen.getByTitle("Auto-merge → develop");
    expect(title).toHaveTextContent("Auto-merge → develop");
    expect(title.className).toContain("line-clamp-2");
    expect(title.className).not.toContain("truncate");
  });

  it("opens fitted and toggles to actual size and back", () => {
    const graph = runGraph({ story: task({}), subtasks: [], trail: [], projectKey: "FB", clientProject: false });
    render(<RunGraphView graph={graph} />);
    fireEvent.click(screen.getByRole("button", { name: "Actual size" }));
    fireEvent.click(screen.getByRole("button", { name: "Fit graph" }));
    expect(screen.getByRole("button", { name: "Actual size" })).toBeInTheDocument();
  });
});

describe("edgeStyle", () => {
  const box = (state: "done" | "current" | "stopped" | "todo") => ({ x: 0, y: 0, w: 1, h: 1, state });
  const RED = "#ef4444", GREEN = "#34d399", DIM = "#4b5563";

  it("reds only edges out of a stopped node", () => {
    expect(edgeStyle({ a: box("stopped"), b: box("stopped") }).stroke).toBe(RED); // failing Subtask → Verify
    expect(edgeStyle({ a: box("current"), b: box("stopped") }).stroke).toBe(GREEN); // handoff → failing Subtask
    expect(edgeStyle({ a: box("done"), b: box("stopped") }).stroke).toBe(GREEN); // passed Subtask → Verify
    expect(edgeStyle({ a: box("done"), b: box("done") }).stroke).toBe(GREEN);
  });

  it("dims any edge touching a node not reached", () => {
    expect(edgeStyle({ a: box("todo"), b: box("stopped") }).stroke).toBe(DIM);
    expect(edgeStyle({ a: box("stopped"), b: box("todo") }).stroke).toBe(DIM);
  });

  it("lights a Subtask → Verify edge once its Subtask is done, though Verify is todo", () => {
    const s = edgeStyle({ a: box("done"), b: box("todo"), subtaskToVerify: true });
    expect(s.stroke).toBe(GREEN);
    expect(s.dash).toBe("");
  });

  it("keeps a Subtask → Verify edge dimmed while its Subtask is not done", () => {
    for (const st of ["todo", "current"] as const) {
      const s = edgeStyle({ a: box(st), b: box("todo"), subtaskToVerify: true });
      expect(s.stroke).toBe(DIM);
      expect(s.dash).toBe("5 5");
    }
  });

  it("keeps an unflagged done → todo edge dimmed (Verify → Docs, Orchestrator → Verify)", () => {
    const s = edgeStyle({ a: box("done"), b: box("todo") });
    expect(s.stroke).toBe(DIM);
    expect(s.dash).toBe("5 5");
  });
});

describe("RunGraphView Stop gate edges", () => {
  const RED = "#ef4444", GREEN = "#34d399", DIM = "#4b5563";
  const sub = (status: string) => task({ id: 2, task_number: 2, parent_id: 1, type: "subtask", status: status as Task["status"], title: "A" });
  const reviewFailed = (n: number) => Array.from({ length: n }, (_, i) => ev("review_round", { round: i + 1, verdict: "failed" }));

  /** The two "fails twice" edges: Verify → Stop is a curve, Fix findings → Stop a routed polyline. */
  function stopEdges(graph: ReturnType<typeof runGraph>) {
    const { container } = render(<RunGraphView graph={graph} />);
    const paths = [...container.querySelectorAll("g")]
      .filter((g) => g.textContent === "fails twice")
      .map((g) => g.querySelector("path")!);
    const fixEdge = paths.find((p) => p.getAttribute("d")!.includes(" L"))!;
    const verifyEdge = paths.find((p) => !p.getAttribute("d")!.includes(" L"))!;
    return { container, fixEdge, verifyEdge };
  }

  it("Review failed twice: Fix findings → Stop is red and Verify → Stop is dimmed", () => {
    const graph = runGraph({
      story: task({}),
      subtasks: [sub("done")],
      trail: [ev("stage_entered", "building"), ...reviewFailed(2), ev("run_stopped", { reason: "Code review failed twice" })],
      projectKey: "FB",
      clientProject: false,
    });
    expect(graph.fix.state).toBe("stopped");
    expect(graph.verify.state).toBe("done");
    const { fixEdge, verifyEdge } = stopEdges(graph);
    expect(fixEdge.getAttribute("stroke")).toBe(RED);
    expect(verifyEdge.getAttribute("stroke")).toBe(DIM);
    expect(verifyEdge.getAttribute("stroke")).not.toBe(GREEN);
  });

  it("Subtask failed Verify twice: Verify → Stop is red and Fix findings → Stop is dimmed", () => {
    const graph = runGraph({
      story: task({}),
      subtasks: [sub("in_progress")],
      trail: [
        ev("stage_entered", "building"),
        ev("subtask_handoff", { subtask: "FB-2", agent: "implementer", model: "sonnet" }),
        ev("verify_round", { subtask: "FB-2", round: 1, result: "fail" }),
        ev("run_stopped", { reason: "Verify failed twice" }),
      ],
      projectKey: "FB",
      clientProject: false,
    });
    expect(graph.verify.state).toBe("stopped");
    const { fixEdge, verifyEdge } = stopEdges(graph);
    expect(verifyEdge.getAttribute("stroke")).toBe(RED);
    expect(fixEdge.getAttribute("stroke")).toBe(DIM);
  });

  it("Run not stopped, never stopped or restarted: both edges into Stop are dimmed", () => {
    const base = { subtasks: [sub("done")], projectKey: "FB", clientProject: false };
    const never = runGraph({ ...base, story: task({ run_stopped: false }), trail: [ev("stage_entered", "building")] });
    const restarted = runGraph({
      ...base,
      story: task({ run_stopped: false }),
      trail: [
        ev("stage_entered", "building"),
        ev("verify_round", { subtask: "FB-2", round: 1, result: "fail" }),
        ev("run_stopped", { reason: "Verify failed twice" }),
      ],
    });
    expect(never.stop.state).toBe("todo");
    expect(restarted.stop.state).toBe("done");
    for (const graph of [never, restarted]) {
      const { fixEdge, verifyEdge } = stopEdges(graph);
      expect(fixEdge.getAttribute("stroke")).toBe(DIM);
      expect(verifyEdge.getAttribute("stroke")).toBe(DIM);
      cleanup();
    }
  });
});

describe("RunGraphView Review lane Stop gate (FB-174)", () => {
  const RED = "#ef4444", DIM = "#4b5563";
  const W = 196, H = 56, CAPTION = 22;
  const sub = (n: number, status: Task["status"], type: Task["type"] = "subtask") =>
    task({ id: n, task_number: n, parent_id: 1, type, status, title: `S${n}` });
  const failed = (round: number) => ev("review_round", { round, verdict: "failed" });
  const built = [ev("stage_entered", "building"), ev("verify_round", { subtask: "FB-2", round: 1, result: "pass" })];
  const graphOf = (subtasks: Task[], trail: TrailEvent[], run_stopped = true, clientProject = false) =>
    runGraph({ story: task({ run_stopped }), subtasks, trail, projectKey: "FB", clientProject });

  /** The edges into a gate, found by the boxes they join, with their stroke. */
  function gateEdges(graph: ReturnType<typeof runGraph>) {
    const layout = layoutRunGraph(graph);
    const box = (id: string) => layout.nodes.find((n) => n.id === id)!.box;
    const into = (gate: string) => layout.edges.filter((e) => e.b === box(gate));
    const stroke = (gate: string, from: string) => edgeStyle(into(gate).find((e) => e.a === box(from))!).stroke;
    return { layout, box, into, stroke };
  }

  const reviewFailedTwice = () =>
    graphOf([sub(2, "done"), sub(3, "done", "bug")], [
      ...built, failed(1), ev("bug_subtask_filed", { subtask: "FB-3" }), ev("verify_round", { subtask: "FB-3", round: 1, result: "pass" }),
      failed(2), ev("run_stopped", { reason: "Review failed twice" }),
    ]);

  it("Review failed twice: the Review gate is red with the reason; only Fix findings → Stop is red", () => {
    const graph = reviewFailedTwice();
    const { stroke } = gateEdges(graph);
    expect(stroke("stop-review", "fix")).toBe(RED);
    expect(stroke("stop-review", "review")).toBe(DIM);
    expect(stroke("stop-review", "merge")).toBe(DIM);
    expect(stroke("stop", "verify")).toBe(DIM);
    const { container } = render(<RunGraphView graph={graph} />);
    const gate = container.querySelector('[data-node="stop-review"]')!;
    expect(gate.getAttribute("data-state")).toBe("stopped");
    expect(gate.querySelector(".run-waiting")).not.toBeNull();
    expect(gate).toHaveTextContent("Review failed twice");
    expect(container.querySelector('[data-node="stop"]')!.getAttribute("data-state")).not.toBe("stopped");
  });

  it("Integrate failed: the Auto-merge node and Auto-merge → Stop are red; the other two edges are dimmed", () => {
    const graph = graphOf([sub(2, "done")], [
      ...built, ev("review_round", { round: 1, verdict: "passed" }),
      ev("pr_opened", { url: "https://github.com/o/r/pull/9", target: "develop" }),
      ev("run_stopped", { reason: "Integrate: a PR check failed" }),
    ]);
    const { stroke, box } = gateEdges(graph);
    expect(box("merge").state).toBe("stopped");
    expect(stroke("stop-review", "merge")).toBe(RED);
    expect(stroke("stop-review", "fix")).toBe(DIM);
    expect(stroke("stop-review", "review")).toBe(DIM);
  });

  it.each([
    ["before any Review round", [] as TrailEvent[], [sub(2, "done")]],
    ["after one failed round", [failed(1), ev("bug_subtask_filed", { subtask: "FB-3" })], [sub(2, "done"), sub(3, "done", "bug")]],
  ])("Codex unavailable %s: Code review and Code review → Stop are red, Fix findings is not", (_, rounds, subtasks) => {
    const graph = graphOf(subtasks, [...built, ...rounds, ev("run_stopped", { reason: "Review waits: Codex unavailable" })]);
    const { stroke, box } = gateEdges(graph);
    expect(box("review").state).toBe("stopped");
    expect(stroke("stop-review", "review")).toBe(RED);
    expect(box("fix").state).not.toBe("stopped");
    expect(stroke("stop-review", "fix")).toBe(DIM);
    expect(stroke("stop-review", "merge")).toBe(DIM);
  });

  it("a Subtask failed Verify twice: the Build gate and Verify → Stop are red; the Review gate is todo, its edges dimmed", () => {
    const graph = graphOf([sub(2, "in_progress")], [
      ev("stage_entered", "building"),
      ev("verify_round", { subtask: "FB-2", round: 1, result: "fail" }),
      ev("verify_round", { subtask: "FB-2", round: 2, result: "fail" }),
      ev("run_stopped", { reason: "Verify failed twice on FB-2" }),
    ]);
    const { stroke, box, into } = gateEdges(graph);
    expect(box("stop").state).toBe("stopped");
    expect(stroke("stop", "verify")).toBe(RED);
    expect(box("stop-review").state).toBe("todo");
    expect(into("stop-review")).toHaveLength(3);
    for (const e of into("stop-review")) expect(edgeStyle(e).stroke).toBe(DIM);
  });

  it("Integrate failed: the Review gate waits in red with the reason and the Build gate does not", () => {
    const graph = graphOf([sub(2, "done")], [
      ...built, ev("review_round", { round: 1, verdict: "passed" }),
      ev("pr_opened", { url: "https://github.com/o/r/pull/9", target: "develop" }),
      ev("run_stopped", { reason: "Integrate: a PR check failed" }),
    ]);
    const { container } = render(<RunGraphView graph={graph} />);
    const gate = container.querySelector('[data-node="stop-review"]')!;
    expect(gate.getAttribute("data-state")).toBe("stopped");
    expect(gate.querySelector(".run-waiting")).not.toBeNull();
    expect(gate).toHaveTextContent("Integrate: a PR check failed");
    const build = container.querySelector('[data-node="stop"]')!;
    expect(build.getAttribute("data-state")).toBe("todo");
    expect(build.querySelector(".run-waiting")).toBeNull();
    expect(container.querySelector('[data-node="merge"]')!.getAttribute("data-state")).toBe("stopped");
    expect(gateEdges(graph).stroke("stop", "verify")).toBe(DIM);
    cleanup();
  });

  it("restarts: each gate shows only its own side's past stops", () => {
    const afterReview = graphOf([sub(2, "done"), sub(3, "in_progress", "bug")], [
      ...built, failed(1), failed(2), ev("run_stopped", { reason: "Review failed twice" }), ev("run_restarted", ""),
    ], false);
    const afterBuild = graphOf([sub(2, "in_progress")], [
      ev("stage_entered", "building"), ev("verify_round", { subtask: "FB-2", round: 1, result: "fail" }),
      ev("run_stopped", { reason: "Verify failed twice on FB-2" }), ev("run_restarted", ""),
    ], false);
    const shown = (graph: ReturnType<typeof runGraph>, id: string) => {
      const { container } = render(<RunGraphView graph={graph} />);
      const node = container.querySelector(`[data-node="${id}"]`)!;
      const out = [node.getAttribute("data-state"), node.querySelector(".font-mono")!.textContent];
      cleanup();
      return out;
    };
    expect(shown(afterReview, "stop-review")).toEqual(["done", "stopped 1× · restarted"]);
    expect(shown(afterReview, "stop")).toEqual(["todo", "fails twice"]);
    expect(shown(afterBuild, "stop")).toEqual(["done", "stopped 1× · restarted"]);
    expect(shown(afterBuild, "stop-review")[0]).toBe("todo");
  });

  // ─── Layout ───
  type Pt = [number, number];
  type Rect = { x: number; y: number; w: number; h: number };
  const segments = (pts: Pt[]) => pts.slice(1).map((p, i) => [pts[i], p] as [Pt, Pt]);
  /** An axis-aligned segment runs through a rectangle's interior (touching its border is fine). */
  const throughRect = ([[x1, y1], [x2, y2]]: [Pt, Pt], r: Rect) =>
    Math.min(x1, x2) < r.x + r.w && Math.max(x1, x2) > r.x && Math.min(y1, y2) < r.y + r.h && Math.max(y1, y2) > r.y;
  /** Two axis-aligned segments meet (cross, touch or overlap). */
  const meet = ([[ax1, ay1], [ax2, ay2]]: [Pt, Pt], [[bx1, by1], [bx2, by2]]: [Pt, Pt]) =>
    Math.min(ax1, ax2) <= Math.max(bx1, bx2) && Math.max(ax1, ax2) >= Math.min(bx1, bx2) &&
    Math.min(ay1, ay2) <= Math.max(by1, by2) && Math.max(ay1, ay2) >= Math.min(by1, by2);

  const layouts: [string, ReturnType<typeof runGraph>][] = [
    ["no Subtasks", graphOf([], [])],
    ["four Subtasks", graphOf([2, 3, 4, 5].map((n) => sub(n, "done")), built)],
    ["a Client project", graphOf([sub(2, "done")], built, true, true)],
    ["Review failed twice", reviewFailedTwice()],
  ];

  it.each(layouts)("places the Review gate under Auto-merge on the Fix findings row, inside the REVIEW lane (%s)", (_, graph) => {
    const { layout, box } = gateEdges(graph);
    const gate = box("stop-review"), merge = box("merge"), fix = box("fix");
    const lane = layout.lanes[2];
    expect(gate.x).toBe(merge.x);
    expect(gate.y).toBe(fix.y);
    expect(gate.x).toBeGreaterThan(fix.x + W);
    expect(gate.x).toBeGreaterThanOrEqual(layout.laneX);
    expect(gate.x + W).toBeLessThanOrEqual(layout.laneX + layout.laneW);
    expect(gate.y).toBeGreaterThan(lane.top + 14);
    expect(gate.y + H + CAPTION).toBeLessThanOrEqual(lane.bottom);
  });

  it.each(layouts)("routes the three edges into the Review gate as Pedro drew them (%s)", (_, graph) => {
    const { layout, box, into } = gateEdges(graph);
    const gate = box("stop-review"), fix = box("fix"), merge = box("merge"), review = box("review");
    const edge = (from: string) => into("stop-review").find((e) => e.a === box(from))!;

    // Fix findings → Stop: a short horizontal out of the centre of Fix's right side into the gate's left side.
    const f = edge("fix");
    expect(f.label).toBe("fails twice");
    expect(f.pts).toHaveLength(2);
    const [[fx1, fy1], [fx2, fy2]] = f.pts!;
    expect(fx1).toBe(fix.x + W);
    expect(fx2).toBe(gate.x);
    expect(fy1).toBe(fy2);
    expect(fy1).toBe(fix.y + H / 2); // centre of Fix's right side, straight into the centre of the gate's left side

    // Auto-merge → Stop: straight down.
    const m = edge("merge");
    expect(m.label).toBe("fails");
    expect(m.pts).toEqual([[merge.x + W / 2, merge.y + H], [merge.x + W / 2, gate.y]]);

    // Code review → Stop: down from Code review's bottom, right of the findings drop,
    // right through the gap above Fix findings, past it, then down into the gate's top.
    const c = edge("review");
    expect(c.label).toBe("Codex unavailable");
    expect(c.pts).toHaveLength(4);
    const [p0, p1, p2, p3] = c.pts!;
    expect(p0[1]).toBe(review.y + H);
    expect(p0[0]).toBeGreaterThan(review.x + W / 2);
    expect(p0[0]).toBeLessThan(review.x + W);
    expect(p1[0]).toBe(p0[0]);
    expect(p1[1]).toBeGreaterThan(review.y + H + CAPTION); // under the ship captions
    expect(p1[1]).toBeLessThan(fix.y - 8); // above Fix's badge
    expect(p2[1]).toBe(p1[1]);
    expect(p2[0]).toBeGreaterThan(fix.x + W);
    expect(p2[0]).toBeGreaterThan(gate.x);
    expect(p2[0]).toBeLessThan(merge.x + W / 2); // left of the Auto-merge drop
    expect(p3).toEqual([p2[0], gate.y]);

    // "fails twice" label (11px italic, centred on lx, baseline at ly - 5, 4px halo) sits in the
    // gap between Fix and the gate, on its own line, below the "Codex unavailable" horizontal.
    const labelW = f.label!.length * 11 * 0.62 + 4; // conservative per-glyph width plus halo
    expect(f.ly).toBe(fy1);
    expect(f.lx! - labelW / 2).toBeGreaterThanOrEqual(fix.x + W);
    expect(f.lx! + labelW / 2).toBeLessThanOrEqual(gate.x);
    expect(f.ly! - 5 - 11 - 2).toBeGreaterThan(p1[1] + 2);

    // No new edge runs through a card, or another node's caption.
    for (const e of [f, m, c]) {
      for (const seg of segments(e.pts!)) {
        for (const n of layout.nodes) {
          expect(throughRect(seg, n.box), `${e.label} through ${n.id}`).toBe(false);
          if (n.box !== e.a && n.box !== e.b)
            expect(throughRect(seg, { x: n.box.x, y: n.box.y + n.box.h, w: n.box.w, h: CAPTION }), `${e.label} through ${n.id} caption`).toBe(false);
        }
      }
    }
    // Nor meets the findings edge, the findings loop, the bug loop or each other.
    const loops = layout.edges.filter((e) => e.loop);
    expect(loops).toHaveLength(3);
    for (const e of [f, m, c]) {
      for (const o of [...loops, ...[f, m, c].filter((x) => x !== e)]) {
        for (const s1 of segments(e.pts!)) {
          for (const s2 of segments(o.pts!)) {
            // Two edges into the gate may only share nothing; they end on different sides or points.
            expect(meet(s1, s2), `${e.label} meets ${o.label}`).toBe(false);
          }
        }
      }
    }
  });

  it.each(layouts)("keeps the findings edge and both loops' paths, and drops the old Fix → Build Stop route (%s)", (_, graph) => {
    const { layout, box, into } = gateEdges(graph);
    const review = box("review"), fix = box("fix"), orch = box("orchestrator"), integrated = box("integrated");
    const reviewX = review.x + W / 2, fixLoopY = fix.y + H + 30, bugY = fixLoopY + 28;
    const path = (label: string) => layout.edges.find((e) => e.label === label)!.pts;
    expect(path("findings")).toEqual([[reviewX, review.y + H], [reviewX, fix.y + H / 2], [fix.x, fix.y + H / 2]]);
    expect(path("bug Subtask → rebuild, then re-review")).toEqual([
      [fix.x + W / 2, fix.y + H], [fix.x + W / 2, fixLoopY],
      [30, fixLoopY], [30, orch.y + H / 2 + 12], [orch.x, orch.y + H / 2 + 12],
    ]);
    expect(path("bug found → bug Subtask, Story holds")).toEqual([
      [integrated.x + W / 2, review.y + H], [integrated.x + W / 2, bugY], [14, bugY], [14, orch.y + H / 2], [orch.x, orch.y + H / 2],
    ]);
    // Only Verify leads into the Build gate now, and no routed edge runs past the lane border.
    expect(into("stop").map((e) => e.a)).toEqual([box("verify")]);
    for (const e of layout.edges) for (const [x] of e.pts ?? []) expect(x).toBeLessThanOrEqual(layout.laneX + layout.laneW);
  });
});

describe("RunGraphView Subtask → Verify lines", () => {
  it("lights the done Subtask's line to Verify and keeps the other's dimmed while Verify is todo", () => {
    const graph = runGraph({
      story: task({ run_stopped: false }),
      subtasks: [
        task({ id: 2, task_number: 2, parent_id: 1, type: "subtask", status: "done", title: "A" }),
        task({ id: 3, task_number: 3, parent_id: 1, type: "subtask", status: "in_progress", title: "B" }),
      ],
      trail: [ev("stage_entered", "building")],
      projectKey: "FB",
      clientProject: false,
    });
    const { container } = render(<RunGraphView graph={graph} />);
    expect(container.querySelector('[data-node="verify"]')?.getAttribute("data-state")).toBe("todo");
    // Both Subtask → Verify curves end at Verify's left port; group paths by end point.
    const byEnd = new Map<string, Element[]>();
    container.querySelectorAll("svg path").forEach((p) => {
      const end = (p.getAttribute("d") ?? "").trim().split(/\s+/).slice(-2).join(" ");
      byEnd.set(end, [...(byEnd.get(end) ?? []), p]);
    });
    const intoVerify = [...byEnd.values()].find((ps) => ps.length === 2);
    expect(intoVerify).toBeDefined();
    const styles = intoVerify!.map((p) => `${p.getAttribute("stroke")}|${p.getAttribute("stroke-dasharray") ?? ""}`).sort();
    expect(styles).toEqual(["#34d399|", "#4b5563|5 5"]);
  });
});

describe("layoutRunGraph BUILD lane", () => {
  const H = 56, CAPTION = 22;
  const graphOf = (n: number) =>
    runGraph({
      story: task({}),
      subtasks: Array.from({ length: n }, (_, i) =>
        task({ id: i + 2, task_number: i + 2, parent_id: 1, type: "subtask", status: "todo", title: `S${i}` })),
      trail: [ev("stage_entered", "building")],
      projectKey: "FB",
      clientProject: false,
    });

  it.each([0, 1, 2, 3, 5])("keeps every BUILD node and caption inside the lane with %i Subtasks", (n) => {
    const layout = layoutRunGraph(graphOf(n));
    const [plan, build, review] = layout.lanes;
    const buildIds = ["orchestrator", "verify", "stop", "docs", ...Array.from({ length: n }, (_, i) => `sub-${i + 2}`)];
    for (const id of buildIds) {
      const b = layout.nodes.find((p) => p.id === id)!.box;
      expect(b.y, `${id} top`).toBeGreaterThanOrEqual(layout.buildLabelY + 14);
      expect(b.y + b.h + CAPTION, `${id} bottom`).toBeLessThanOrEqual(build.bottom);
    }
    // No lane boxes overlap.
    expect(plan.bottom).toBeLessThan(build.top);
    expect(build.bottom).toBeLessThan(review.top);

    // The "Pedro starts the Run" wire's horizontal run sits in the gap between PLAN and BUILD.
    const wire = layout.edges.find((e) => e.label === "Pedro starts the Run")!;
    const ys = wire.pts!.map((p) => p[1]);
    expect(layout.startTurnY).toBeGreaterThan(plan.bottom);
    expect(layout.startTurnY).toBeLessThan(build.top);
    const horizontal = wire.pts!.slice(1).filter((p, i) => p[1] === wire.pts![i][1]);
    expect(horizontal.length).toBe(1);
    expect(horizontal[0][1]).toBe(layout.startTurnY);
    // Its label (11px text above the line) clears the PLAN lane too.
    expect(layout.startTurnY - 5 - 11).toBeGreaterThan(plan.bottom);
    expect(ys[ys.length - 1]).toBe(layout.nodes.find((p) => p.id === "orchestrator")!.box.y);
  });

  it.each([3, 5])("leaves the BUILD node coordinates unchanged with %i Subtasks", (n) => {
    // The layout before the Stop fix: subTop = buildLabelY + 40 = 210, no extra push.
    const subTop = 210;
    const subsHeight = n * 72 - 22;
    const mid = subTop + subsHeight / 2;
    const branch = Math.max(86, subsHeight / 2 - H / 2);
    const layout = layoutRunGraph(graphOf(n));
    const y = (id: string) => layout.nodes.find((p) => p.id === id)!.box.y;
    expect(y("orchestrator")).toBe(mid - H / 2);
    expect(y("verify")).toBe(mid - H / 2);
    expect(y("stop")).toBe(mid - H / 2 - branch);
    expect(y("docs")).toBe(mid - H / 2 + branch);
    for (let i = 0; i < n; i++) expect(y(`sub-${i + 2}`)).toBe(subTop + i * 72);
  });
});

describe("RunGraphView Subtask card heights", () => {
  const LONG = "Show completion text, done points and percentage in each sprint header";
  const build = (titles: string[]) => {
    const graph = runGraph({
      story: task({}),
      subtasks: titles.map((title, i) =>
        task({ id: i + 2, task_number: i + 2, parent_id: 1, type: "subtask", status: "todo", title })),
      trail: [ev("stage_entered", "building")],
      projectKey: "FB",
      clientProject: false,
    });
    const { container } = render(<RunGraphView graph={graph} />);
    const box = (id: string) => {
      const el = container.querySelector(`[data-node="${id}"]`) as HTMLElement;
      return { top: parseFloat(el.style.top), height: parseFloat(el.style.height) };
    };
    return { container, box, ids: titles.map((_, i) => `sub-${i + 2}`) };
  };

  it("keeps short-titled cards 50px tall, 72px apart", () => {
    const { box } = build(["A", "Template layout", "Signature block"]);
    for (const id of ["sub-2", "sub-3", "sub-4"]) expect(box(id).height).toBe(50);
    expect(box("sub-3").top - box("sub-2").top).toBe(72);
    expect(box("sub-4").top - box("sub-3").top).toBe(72);
  });

  it("grows a long-titled card and lays the stack, edges, Orchestrator, Verify and lane out from real heights", () => {
    const { container, box, ids } = build(["Short", LONG, "Another one"]);
    const [a, b, c] = ids.map(box);
    expect(a.height).toBe(50);
    expect(b.height).toBeGreaterThan(50);
    expect(b.top).toBe(a.top + a.height + 22);
    expect(c.top).toBe(b.top + b.height + 22);
    expect(a.top + a.height).toBeLessThanOrEqual(b.top);
    expect(b.top + b.height).toBeLessThanOrEqual(c.top);

    const paths = [...container.querySelectorAll("svg path")].map((p) => p.getAttribute("d") ?? "");
    const centre = b.top + b.height / 2;
    // Orchestrator -> Subtask ends, Subtask -> Verify starts, at the long card's centre.
    const ends = (d: string) => d.trim().split(/\s+/).slice(-1)[0];
    const starts = (d: string) => d.trim().split(/\s+/)[1];
    expect(paths.some((d) => d.includes(" C") && Number(ends(d)) === centre)).toBe(true);
    expect(paths.some((d) => d.includes(" C") && Number(starts(d)) === centre)).toBe(true);

    const mid = (a.top + c.top + c.height) / 2;
    expect(box("orchestrator").top + 28).toBe(mid);
    expect(box("verify").top + 28).toBe(mid);
    const lane = layoutRunGraph(
      runGraph({
        story: task({}),
        subtasks: ["Short", LONG, "Another one"].map((title, i) =>
          task({ id: i + 2, task_number: i + 2, parent_id: 1, type: "subtask", status: "todo", title })),
        trail: [ev("stage_entered", "building")],
        projectKey: "FB",
        clientProject: false,
      }),
    ).lanes[1];
    expect(lane.bottom).toBeGreaterThan(c.top + c.height);
  });

  it("gives the Subtask title a two-line clamp and a tooltip with the full title", () => {
    build([LONG]);
    const title = screen.getByTitle(LONG);
    expect(title.className).toContain("line-clamp-2");
    expect(title.className).not.toContain("truncate");
    expect(title).toHaveTextContent(LONG);
  });
});

describe("RunGraphView Subtask card heights (QA)", () => {
  const LONG = "Show completion text, done points and percentage in each sprint header";
  const graphOf = (titles: string[]) =>
    runGraph({
      story: task({}),
      subtasks: titles.map((title, i) =>
        task({ id: i + 2, task_number: i + 2, parent_id: 1, type: "subtask", status: "todo", title })),
      trail: [ev("stage_entered", "building")],
      projectKey: "FB",
      clientProject: false,
    });

  it("sizes short but wide titles, and short titles beside a long key, above 50px (FB-170)", () => {
    const heights = (projectKey: string, num: number, titles: string[]) =>
      layoutRunGraph(
        runGraph({
          story: task({}),
          subtasks: titles.map((title, i) =>
            task({ id: i + 2, task_number: num, parent_id: 1, type: "subtask", status: "todo", title })),
          trail: [ev("stage_entered", "building")],
          projectKey,
          clientProject: false,
        }),
      ).nodes.filter((p) => p.sub).map((p) => p.box.h);
    // 15 characters, but worst-case wide glyphs wrap beside "FB-166".
    expect(heights("FB", 166, ["WWW WWW WWW WWW", "MMMM MMMM MMMM"])).toEqual([66, 66]);
    // An ordinary title that fits beside "FB-2" wraps beside a 13-character key.
    expect(heights("FB", 2, ["Template layout"])).toEqual([50]);
    expect(heights("LONGKEY", 12345, ["Template layout"])).toEqual([66]);
  });

  it("sizes titles of wide symbols, em dashes and CJK above 50px beside FB-166 (FB-170, QA)", () => {
    const heights = (titles: string[]) =>
      layoutRunGraph(
        runGraph({
          story: task({}),
          subtasks: titles.map((title, i) =>
            task({ id: i + 2, task_number: 166, parent_id: 1, type: "subtask", status: "todo", title })),
          trail: [ev("stage_entered", "building")],
          projectKey: "FB",
          clientProject: false,
        }),
      ).nodes.filter((p) => p.sub).map((p) => p.box.h);
    // Measured in Segoe UI 12px (the app's system-ui on Windows), each of these
    // is wider than the ~131px beside "FB-166" and wraps to two lines.
    expect(heights([
      "%%%%% &&&&& %%%%",          // % is 0.82em, & is 0.80em: ~143px
      "— — — — — — — — — —", // em dash is 1em: ~150px
      "数据库迁移和模式初始化",   // CJK is 1em: ~132px
    ])).toEqual([66, 66, 66]);
  });

  it("anchors the exact Orchestrator->Subtask and Subtask->Verify paths at the long card's own centre (asymmetric stack)", () => {
    // The long card is first, so its centre differs from the Orchestrator/Verify centre.
    const layout = layoutRunGraph(graphOf([LONG, "Short", "Another"]));
    const box = (id: string) => layout.nodes.find((p) => p.id === id)!.box;
    const long = box("sub-2"), orch = box("orchestrator"), verify = box("verify");
    const centre = long.y + long.h / 2;
    expect(centre).not.toBe(orch.y + orch.h / 2);
    const { container } = render(<RunGraphView graph={graphOf([LONG, "Short", "Another"])} />);
    const ds = [...container.querySelectorAll("svg path")].map((p) => p.getAttribute("d") ?? "");
    const into = ds.find((d) => d.startsWith(`M${orch.x + orch.w} ${orch.y + orch.h / 2} C`) && d.endsWith(` ${long.x} ${centre}`));
    const out = ds.find((d) => d.startsWith(`M${long.x + long.w} ${centre} C`) && d.endsWith(` ${verify.x} ${verify.y + verify.h / 2}`));
    expect(into, "Orchestrator -> long Subtask path").toBeDefined();
    expect(out, "long Subtask -> Verify path").toBeDefined();
  });

  it.each([1, 2, 3, 5])("keeps every BUILD node inside the lane, without overlaps, with %i long-titled Subtasks", (n) => {
    const layout = layoutRunGraph(graphOf(Array.from({ length: n }, () => LONG)));
    const [plan, build, review] = layout.lanes;
    const subs = Array.from({ length: n }, (_, i) => layout.nodes.find((p) => p.id === `sub-${i + 2}`)!.box);
    for (const id of ["orchestrator", "verify", "stop", "docs", ...subs.map((_, i) => `sub-${i + 2}`)]) {
      const b = layout.nodes.find((p) => p.id === id)!.box;
      expect(b.y, `${id} top`).toBeGreaterThanOrEqual(layout.buildLabelY + 14);
      expect(b.y + b.h + 22, `${id} bottom`).toBeLessThanOrEqual(build.bottom);
    }
    subs.forEach((b) => expect(b.h).toBeGreaterThan(50));
    subs.slice(1).forEach((b, i) => expect(b.y).toBe(subs[i].y + subs[i].h + 22));
    const orch = layout.nodes.find((p) => p.id === "orchestrator")!.box;
    expect(orch.y + 28).toBe((subs[0].y + subs[n - 1].y + subs[n - 1].h) / 2);
    expect(plan.bottom).toBeLessThan(build.top);
    expect(build.bottom).toBeLessThan(review.top);
  });
});

describe("RunGraphView loop edges", () => {
  const INDIGO = "#818cf8", AMBER = "#f59e0b", DIM = "#4b5563";
  const box = { x: 0, y: 0, w: 1, h: 1, state: "done" as const };
  const W = 196, H = 56;

  it("draws an active loop solid in its colour and an inactive one dashed grey", () => {
    const findings = edgeStyle({ a: box, b: box, loop: "findings", active: true });
    const bug = edgeStyle({ a: box, b: box, loop: "bug", active: true });
    expect([findings.stroke, findings.dash]).toEqual([INDIGO, ""]);
    expect([bug.stroke, bug.dash]).toEqual([AMBER, ""]);
    for (const loop of ["findings", "bug"] as const) {
      const s = edgeStyle({ a: box, b: box, loop, active: false });
      expect([s.stroke, s.dash]).toEqual([DIM, "6 5"]);
    }
  });

  it("starts the Fix findings → Orchestrator loop at the card's bottom-centre, clear of the caption and the bug loop", () => {
    const layout = layoutRunGraph(runGraph({ story: task({}), subtasks: [], trail: [], projectKey: "FB", clientProject: false }));
    const at = (id: string) => layout.nodes.find((n) => n.id === id)!.box;
    const fix = at("fix"), orch = at("orchestrator");
    const loop = layout.edges.find((e) => e.a === fix && e.b === orch)!;
    const pts = loop.pts!;
    expect(pts[0]).toEqual([fix.x + W / 2, fix.y + H]);
    expect(pts[1][0]).toBe(pts[0][0]);
    expect(pts[1][1]).toBeGreaterThan(fix.y + H);
    const last = pts[pts.length - 1];
    expect(last[0]).toBe(orch.x);
    expect(last[1]).toBeGreaterThan(orch.y);
    expect(last[1]).toBeLessThan(orch.y + H);
    // Its horizontal sits below the card and caption, above the bug loop's horizontal.
    const fixLoopY = pts[1][1];
    const bugEdge = layout.edges.find((e) => e.loop === "bug")!;
    const bugY = bugEdge.pts![1][1];
    expect(pts[2][1]).toBe(fixLoopY);
    expect(fixLoopY).toBeGreaterThan(fix.y + H + 14);
    expect(fixLoopY).toBeLessThan(bugY);
    expect(loop.ly!).toBeGreaterThan(fix.y + H + 14);
    expect(loop.ly!).toBeLessThan(bugY);
  });

  const pathOf = (container: HTMLElement, label: string) =>
    [...container.querySelectorAll("g")].find((g) => g.textContent === label)!.querySelector("path")!;
  /** The Fix findings → Orchestrator loop: the only path starting at Fix findings' bottom-centre. */
  const fixLoopPath = (container: HTMLElement) => {
    const s = (container.querySelector('[data-node="fix"]') as HTMLElement).style;
    const start = `M${parseFloat(s.left) + W / 2} ${parseFloat(s.top) + H} L`;
    return [...container.querySelectorAll("svg path")].find((p) => p.getAttribute("d")!.startsWith(start))!;
  };
  const style = (p: Element) => [p.getAttribute("stroke"), p.getAttribute("stroke-dasharray")];

  it("draws the bug loop solid amber once a bug is found after Integrate", () => {
    const graph = runGraph({
      story: task({ status: "integrated_tests", run_stopped: false }),
      subtasks: [],
      trail: [ev("stage_entered", "integrated_tests"), ev("bug_subtask_filed", { subtask: "FB-9" })],
      projectKey: "FB",
      clientProject: false,
    });
    expect(graph.bugLoop).toBe(true);
    const { container } = render(<RunGraphView graph={graph} />);
    expect(style(pathOf(container, "bug found → bug Subtask, Story holds"))).toEqual([AMBER, ""]);
  });

  it("draws both findings loops solid indigo after a findings round, dashed grey before", () => {
    const fired = runGraph({
      story: task({ run_stopped: false }),
      subtasks: [],
      trail: [ev("stage_entered", "building"), ev("review_round", { round: 1, verdict: "failed" })],
      projectKey: "FB",
      clientProject: false,
    });
    expect(fired.fix.state).not.toBe("todo");
    const { container } = render(<RunGraphView graph={fired} />);
    expect(style(pathOf(container, "findings"))).toEqual([INDIGO, ""]);
    expect(style(fixLoopPath(container))).toEqual([INDIGO, ""]);
    cleanup();

    const empty = runGraph({ story: task({ run_stopped: false }), subtasks: [], trail: [], projectKey: "FB", clientProject: false });
    const { container: c2 } = render(<RunGraphView graph={empty} />);
    expect(style(pathOf(c2, "findings"))).toEqual([DIM, "6 5"]);
    expect(style(fixLoopPath(c2))).toEqual([DIM, "6 5"]);
    expect(style(pathOf(c2, "bug found → bug Subtask, Story holds"))).toEqual([DIM, "6 5"]);
  });
});

describe("RunGraphView Subtask roles (FB-171)", () => {
  const render3 = (trail: TrailEvent[]) => {
    const graph = runGraph({
      story: task({ run_stopped: false }),
      subtasks: [
        task({ id: 2, task_number: 2, parent_id: 1, type: "subtask", status: "done", title: "Template layout" }),
        task({ id: 3, task_number: 3, parent_id: 1, type: "subtask", status: "todo", title: "Simplify" }),
        task({ id: 4, task_number: 4, parent_id: 1, type: "bug", status: "todo", title: "Review findings" }),
      ],
      trail: [ev("stage_entered", "building"), ...trail],
      projectKey: "FB",
      clientProject: false,
    });
    return render(<RunGraphView graph={graph} />).container;
  };
  const card = (c: HTMLElement, id: string) => c.querySelector(`[data-node="${id}"]`) as HTMLElement;

  it("puts the role icon in the role colour before the key on every card", () => {
    const c = render3([]);
    for (const [id, key, cls] of [["sub-2", "FB-2", "text-blue-400"], ["sub-3", "FB-3", "text-fuchsia-400"], ["sub-4", "FB-4", "text-red-400"]]) {
      const keyEl = within(card(c, id)).getByText(key);
      const icon = keyEl.previousElementSibling as SVGElement;
      expect(icon.tagName.toLowerCase()).toBe("svg");
      expect(icon.getAttribute("class")).toContain(cls);
    }
    cleanup();
  });

  it("colours the agent line by role: SIMPLIFY, BUG · agent · model, teal for a plan Subtask", () => {
    const c = render3([
      ev("subtask_handoff", { subtask: "FB-2", agent: "frontend-design", model: "opus" }),
      ev("subtask_handoff", { subtask: "FB-4", agent: "implementer", model: "opus" }),
    ]);
    const simplify = within(card(c, "sub-3")).getByText("SIMPLIFY");
    expect(simplify.className).toContain("text-fuchsia-400");
    const bug = within(card(c, "sub-4")).getByText("BUG · implementer · opus");
    expect(bug.className).toContain("text-red-400");
    expect(bug.className).toContain("uppercase");
    const plan = within(card(c, "sub-2")).getByText("frontend-design · opus");
    expect(plan.className).toContain("text-teal-400");
    cleanup();
  });

  it("reads BUG · not handed out for a bug not yet handed out", () => {
    const c = render3([]);
    expect(within(card(c, "sub-4")).getByText("BUG · not handed out").className).toContain("text-red-400");
    expect(card(c, "sub-4").style.width).toBe("196px");
    cleanup();
  });

  it("counts the role icon when sizing a title beside its key", () => {
    // 11 W's at the worst-case 0.96em are ~127px: inside the ~139px beside "FB-2"
    // without the 18px icon allowance, past the ~121px left with it.
    const layout = layoutRunGraph(
      runGraph({
        story: task({}),
        subtasks: [task({ id: 2, task_number: 2, parent_id: 1, type: "subtask", status: "todo", title: "WWWWWWWWWWW" })],
        trail: [ev("stage_entered", "building")],
        projectKey: "FB",
        clientProject: false,
      }),
    );
    expect(layout.nodes.find((p) => p.id === "sub-2")!.box.h).toBe(66);
  });
});

describe("RunLegend roles (FB-171)", () => {
  it("lists the three roles, each beside its icon in its colour", () => {
    render(<RunLegend />);
    for (const [label, cls] of [["Subtask from the plan", "text-blue-400"], ["Simplify", "text-fuchsia-400"], ["Bug Subtask", "text-red-400"]]) {
      const entry = screen.getByText(label);
      const icon = entry.querySelector("svg");
      expect(icon, label).not.toBeNull();
      expect(icon!.getAttribute("class")).toContain(cls);
    }
    cleanup();
  });
});
