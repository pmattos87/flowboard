import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RunGraphView, edgeStyle, layoutRunGraph } from "@/features/story/RunGraphView";
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
      trail: [ev("stage_entered", "building"), ...reviewFailed(1), ev("run_stopped", { reason: "Verify failed twice" })],
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

  it("routes Fix findings → Stop clear of the findings loops and the ship row", () => {
    const graph = runGraph({ story: task({}), subtasks: [], trail: [], projectKey: "FB", clientProject: false });
    const { container, fixEdge } = stopEdges(graph);
    const pts = fixEdge.getAttribute("d")!.replace("M", "").split(" L").map((p) => p.split(" ").map(Number));
    expect(pts).toHaveLength(4);
    const fixTop = Number(container.querySelector('[data-node="fix"]')!.getAttribute("style")?.match(/top: (\d+)/)?.[1]);
    const fixLeft = Number(container.querySelector('[data-node="fix"]')!.getAttribute("style")?.match(/left: (\d+)/)?.[1]);
    const lastShip = container.querySelector('[data-node="production"]')!.getAttribute("style")!;
    const shipEnd = Number(lastShip.match(/left: (\d+)/)![1]) + 196;
    // Leaves Fix findings' upper right, above the findings loop that leaves at mid-height.
    expect(pts[0]).toEqual([fixLeft + 196, fixTop + 12]);
    // Its vertical run is past the last ship card, so it passes through none.
    expect(pts[1][0]).toBeGreaterThan(shipEnd);
    expect(pts[1][1]).toBe(pts[0][1]);
    expect(pts[2][0]).toBe(pts[1][0]);
  });

  it("runs the Stop vertical clearly outside the lane border and inside the SVG", () => {
    const layouts = [
      { subtasks: [], clientProject: false },
      { subtasks: [sub("done"), sub("done"), sub("done"), sub("done")], clientProject: false },
      { subtasks: [sub("done")], clientProject: true },
    ];
    for (const { subtasks, clientProject } of layouts) {
      const graph = runGraph({ story: task({}), subtasks, trail: [], projectKey: "FB", clientProject });
      const { container, fixEdge } = stopEdges(graph);
      const lane = container.querySelector("div.rounded-xl.border")!.getAttribute("style")!;
      const laneRight = Number(lane.match(/left: (\d+)/)![1]) + Number(lane.match(/width: (\d+)/)![1]);
      const svgWidth = Number(container.querySelector("svg")!.getAttribute("width"));
      const stopX = Number(fixEdge.getAttribute("d")!.replace("M", "").split(" L")[1].split(" ")[0]);
      expect(stopX).toBeGreaterThanOrEqual(laneRight + 12);
      expect(stopX).toBeLessThan(svgWidth);
      cleanup();
    }
  });

  it("enters Stop from the right and clears the findings loops, PR card and Docs turn", () => {
    const graph = runGraph({ story: task({}), subtasks: [], trail: [], projectKey: "FB", clientProject: false });
    const { container, fixEdge } = stopEdges(graph);
    const xy = (id: string) => {
      const s = container.querySelector(`[data-node="${id}"]`)!.getAttribute("style")!;
      return [Number(s.match(/left: (\d+)/)![1]), Number(s.match(/top: (\d+)/)![1])];
    };
    const pathPts = (d: string) => d.replace("M", "").split(" L").map((p) => p.split(" ").map(Number));
    const pts = pathPts(fixEdge.getAttribute("d")!);
    const [stopX, stopY] = xy("stop"), [fixX, fixY] = xy("fix"), [, prY] = xy("pr"), [docsX] = xy("docs");
    // Ends on Stop's right side at mid-height, coming in from the right.
    expect(pts[3]).toEqual([stopX + 196, stopY + 28]);
    expect(pts[2]).toEqual([pts[1][0], stopY + 28]);
    expect(pts[2][0]).toBeGreaterThan(stopX + 196);
    // Vertical run is right of the Docs turn (docs.x + W + 34).
    expect(pts[1][0]).toBeGreaterThan(docsX + 196 + 34);
    // Horizontal run stays below the PR card and above the Fix → Orchestrator
    // loop, which leaves Fix findings at mid-height.
    expect(pts[0][1]).toBeGreaterThan(prY + 56);
    expect(pts[0][1]).toBeLessThan(fixY + 28);
    // Every findings-loop point stays off the new line's horizontal run.
    const loops = [...container.querySelectorAll("path")].filter((p) => p.getAttribute("stroke-dasharray") === "6 5");
    for (const loop of loops) {
      const lp = pathPts(loop.getAttribute("d")!);
      for (let i = 1; i < lp.length; i++) {
        const [[x1, y1], [x2, y2]] = [lp[i - 1], lp[i]];
        if (x1 === x2 && x1 > pts[0][0] && x1 < pts[1][0]) {
          // A vertical loop segment under the horizontal: only the bug loop may cross it.
          const crosses = Math.min(y1, y2) <= pts[0][1] && Math.max(y1, y2) >= pts[0][1];
          if (crosses) expect(x1).not.toBe(fixX + 196 + 18);
        }
      }
    }
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
