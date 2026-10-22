import { useLayoutEffect, useRef, useState } from "react";
import { Bot, Clock, GitBranch, LayoutGrid, Maximize2, Search, Send, Sparkles, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeKind, NodeState, RunGraph, RunNode, SubtaskNode } from "./runGraph";

// The Run node graph on the Story page (SF-62), styled after
// docs/reference/run-view-mockup.png but drawn for this Run: Plan, Build (one
// node per Subtask) and Review → Production, with the findings and bug loops.

const W = 196, H = 56, SW = 196, SH = 50;
/** Gap between nodes in a row, and inside the Build group. */
const GAP = 80, BUILD_GAP = 90;
const COL = W + GAP;
/** Outer padding; the return loops run in the left padding, clear of every card. */
const PAD = 48;
const BUG_X = 14, FIX_X = 30;
const SUB_STEP = SH + 22;

const KIND: Record<NodeKind, { Icon: LucideIcon; cls: string; label: string }> = {
  trigger:   { Icon: Zap,        cls: "text-amber-400",  label: "TRIGGER" },
  design:    { Icon: Sparkles,   cls: "text-purple-400", label: "DESIGN" },
  gate:      { Icon: Clock,      cls: "text-gray-400",   label: "GATE" },
  flowboard: { Icon: LayoutGrid, cls: "text-blue-400",   label: "FLOWBOARD" },
  agent:     { Icon: Bot,        cls: "text-teal-400",   label: "AGENT" },
  git:       { Icon: GitBranch,  cls: "text-gray-400",   label: "GIT" },
  review:    { Icon: Search,     cls: "text-indigo-400", label: "REVIEW" },
  skill:     { Icon: Send,       cls: "text-green-400",  label: "SKILL" },
};

export interface Box { x: number; y: number; w: number; h: number; state: NodeState }

const right = (b: Box): [number, number] => [b.x + b.w, b.y + b.h / 2];
const left = (b: Box): [number, number] => [b.x, b.y + b.h / 2];

function frame(state: NodeState) {
  return {
    done: "border-gray-700",
    current: "run-current border-blue-500/70 shadow-[0_0_14px_rgba(59,130,246,0.3)]",
    stopped: "border-red-500/70 shadow-[0_0_18px_rgba(239,68,68,0.35)]",
    todo: "border-dashed border-gray-700 opacity-50",
  }[state];
}

function Badge({ state }: { state: NodeState }) {
  if (state === "done")
    return <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-emerald-500 text-black text-[11px] flex items-center justify-center">✓</span>;
  if (state === "stopped")
    return <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">!</span>;
  if (state === "current")
    return <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-blue-500 animate-pulse" />;
  return <span className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-gray-700 border border-gray-600" />;
}

function NodeBox({ node, x, y }: { node: RunNode; x: number; y: number }) {
  const { Icon, cls, label } = KIND[node.kind];
  // A stopped Run waits at the Stop gate for Pedro: it gets the running
  // highlight, in red.
  const waiting = node.id === "stop" && node.state === "stopped";
  return (
    <div className="absolute" style={{ left: x, top: y, width: W }} data-node={node.id} data-state={node.state}>
      <div
        className={cn("relative rounded-lg border bg-[#11141b] px-3 flex items-center gap-2.5", frame(node.state), waiting && "run-current run-waiting")}
        style={{ height: H }}
      >
        <Badge state={node.state} />
        <span className={cn("h-7 w-7 rounded-md bg-gray-800 flex items-center justify-center shrink-0", cls)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] text-white font-medium truncate">{node.title}</div>
          <div className={cn("text-[10px] font-semibold tracking-wide", cls)}>{label}</div>
        </div>
      </div>
      <div className="text-[10px] font-mono text-gray-500 mt-1 truncate" title={node.caption}>{node.caption}</div>
    </div>
  );
}

function SubtaskBox({ node, x, y }: { node: SubtaskNode; x: number; y: number }) {
  const who = [node.info?.agent, node.info?.model].filter(Boolean).join(" · ");
  return (
    <div
      className={cn("absolute rounded-lg border bg-[#11141b] px-3 py-1.5", frame(node.state))}
      style={{ left: x, top: y, width: SW, height: SH }}
      data-node={node.id}
      data-state={node.state}
    >
      <Badge state={node.state} />
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono text-gray-500 shrink-0">{node.key}</span>
        <span className="text-[12px] text-white truncate">{node.title}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1 min-w-0">
        <span className="text-[10px] font-semibold text-teal-400 uppercase truncate">{who || "not handed out"}</span>
        <span className="flex gap-0.5 shrink-0">
          {(node.info?.rounds ?? []).map((r, i) => (
            <span
              key={i}
              className={cn("text-[9px] font-mono px-1 rounded", r === "pass" ? "bg-emerald-900/50 text-emerald-400" : "bg-red-900/50 text-red-400")}
            >
              r{i + 1}{r === "pass" ? "✓" : "✗"}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

export interface Edge { a: Box; b: Box; pts?: [number, number][]; label?: string; lx?: number; ly?: number; loop?: "bug" | "findings"; active?: boolean }

export function edgeStyle(e: Edge) {
  if (e.loop === "bug") return e.active ? { stroke: "#f59e0b", dash: "6 5", op: 0.85 } : { stroke: "#4b5563", dash: "6 5", op: 0.6 };
  if (e.loop === "findings") return e.active ? { stroke: "#818cf8", dash: "6 5", op: 0.85 } : { stroke: "#4b5563", dash: "6 5", op: 0.6 };
  // An edge touching a node the Run has not reached stays dimmed. Red marks
  // only where a failure flows on: out of a stopped node. Edges into it (a
  // handoff, a Subtask that passed) worked, so they stay green.
  if (e.a.state === "todo" || e.b.state === "todo") return { stroke: "#4b5563", dash: "5 5", op: 0.8 };
  if (e.a.state === "stopped") return { stroke: "#ef4444", dash: "", op: 0.9 };
  return { stroke: "#34d399", dash: "", op: 0.7 };
}

export function RunGraphView({ graph }: { graph: RunGraph }) {
  const nodes: { box: Box; el: React.ReactNode }[] = [];
  const edges: Edge[] = [];
  const place = (node: RunNode, x: number, y: number): Box => {
    const box = { x, y, w: W, h: H, state: node.state };
    nodes.push({ box, el: <NodeBox key={node.id} node={node} x={x} y={y} /> });
    return box;
  };

  // Every row is centered over the widest one (the Review row, usually).
  const rowWidth = (n: number) => n * W + (n - 1) * GAP;
  const buildWidth = W + BUILD_GAP + SW + BUILD_GAP + W + BUILD_GAP + W;
  const contentWidth = Math.max(rowWidth(graph.plan.length), rowWidth(graph.ship.length), buildWidth);
  const centered = (w: number) => PAD + (contentWidth - w) / 2;

  // Plan
  const planLabelY = 16;
  const planY = planLabelY + 28;
  const planX = centered(rowWidth(graph.plan.length));
  const plan = graph.plan.map((n, i) => place(n, planX + i * COL, planY));
  plan.slice(1).forEach((b, i) => edges.push({ a: plan[i], b }));

  // Build: Subtasks fan out from the Orchestrator and back into Verify, both
  // centered on the stack.
  const startTurnY = planY + H + 40;
  const buildLabelY = startTurnY + 30;
  const subTop = buildLabelY + 40;
  const count = Math.max(graph.subtasks.length, 1);
  const subsHeight = count * SUB_STEP - (SUB_STEP - SH);
  const mid = subTop + subsHeight / 2;
  const buildX = centered(buildWidth);
  const subX = buildX + W + BUILD_GAP;
  const verifyX = subX + SW + BUILD_GAP;
  const branchX = verifyX + W + BUILD_GAP;
  const branch = Math.max(86, subsHeight / 2 - H / 2);
  const orch = place(graph.orchestrator, buildX, mid - H / 2);
  const subBoxes: Box[] = graph.subtasks.map((s, i) => {
    const box = { x: subX, y: subTop + i * SUB_STEP, w: SW, h: SH, state: s.state };
    nodes.push({ box, el: <SubtaskBox key={s.id} node={s} x={box.x} y={box.y} /> });
    return box;
  });
  const verify = place(graph.verify, verifyX, mid - H / 2);
  const stop = place(graph.stop, branchX, mid - H / 2 - branch);
  const docs = place(graph.docs, branchX, mid - H / 2 + branch);
  const start = plan[plan.length - 1];
  const startX = start.x + W / 2;
  const orchX = orch.x + W / 2;
  edges.push({
    a: start, b: orch, label: "Pedro starts the Run", lx: (startX + orchX) / 2, ly: startTurnY,
    pts: [[startX, planY + H], [startX, startTurnY], [orchX, startTurnY], [orchX, orch.y]],
  });
  if (subBoxes.length === 0) edges.push({ a: orch, b: verify });
  subBoxes.forEach((b) => edges.push({ a: orch, b }, { a: b, b: verify }));
  edges.push({ a: verify, b: stop, label: "fails twice" }, { a: verify, b: docs, label: "all pass" });

  // Review → Integrate → Release → Production
  const buildBottom = Math.max(subTop + subsHeight, docs.y + H + 22);
  const turnY = buildBottom + 36;
  const shipLabelY = turnY + 26;
  const shipY = shipLabelY + 30;
  const shipX = centered(rowWidth(graph.ship.length));
  const ship = graph.ship.map((n, i) => place(n, shipX + i * COL, shipY));
  const fix = place(graph.fix, shipX + COL, shipY + H + 64);
  const reviewX = shipX + W / 2;
  const turnRightX = docs.x + W + 34;
  edges.push({
    a: docs, b: ship[0], label: "every Subtask verified", lx: (reviewX + turnRightX) / 2, ly: turnY,
    pts: [[docs.x + W, docs.y + H / 2], [turnRightX, docs.y + H / 2], [turnRightX, turnY], [reviewX, turnY], [reviewX, shipY]],
  });
  // Labels sit above the row, centered on the gap, clear of the cards.
  const shipLabels: Record<string, string> = { pr: "clean", release: "passed → tested", production: "approved" };
  ship.slice(1).forEach((b, i) =>
    edges.push({ a: ship[i], b, label: shipLabels[graph.ship[i + 1].id], lx: b.x - GAP / 2, ly: shipY - 9 }),
  );
  const findingsLive = graph.fix.state !== "todo";
  edges.push({
    a: ship[0], b: fix, label: "findings", lx: reviewX + 42, ly: fix.y + H / 2, loop: "findings", active: findingsLive,
    pts: [[reviewX, shipY + H], [reviewX, fix.y + H / 2], [fix.x, fix.y + H / 2]],
  });
  // The findings go back to the builders as a bug Subtask; once it passes
  // Verify, the normal path takes the Story to Review round 2. The loop leaves
  // the node's right side, runs under its caption, then up the left padding.
  const fixLoopY = fix.y + H + 30;
  edges.push({
    a: fix, b: orch, loop: "findings", active: findingsLive,
    label: "bug Subtask → rebuild, then re-review", lx: (FIX_X + fix.x) / 2 + 20, ly: fixLoopY,
    pts: [
      [fix.x + W, fix.y + H / 2], [fix.x + W + 18, fix.y + H / 2], [fix.x + W + 18, fixLoopY],
      [FIX_X, fixLoopY], [FIX_X, orch.y + H / 2 + 12], [orch.x, orch.y + H / 2 + 12],
    ],
  });
  const integrated = ship.find((_, i) => graph.ship[i].id === "integrated") ?? ship[0];
  const integratedX = integrated.x + W / 2;
  const bugY = fixLoopY + 28;
  edges.push({
    a: integrated, b: orch, loop: "bug", active: graph.bugLoop,
    label: "bug found → bug Subtask, Story holds", lx: (BUG_X + integratedX) / 2 + 40, ly: bugY,
    pts: [[integratedX, shipY + H], [integratedX, bugY], [BUG_X, bugY], [BUG_X, orch.y + H / 2], [orch.x, orch.y + H / 2]],
  });

  const width = contentWidth + 2 * PAD;
  const height = bugY + 32;
  // Each lane sits in a dim box. The boxes leave the gaps between them to the
  // long connections, and the left padding to the return loops.
  const laneX = PAD - 10;
  const laneW = contentWidth + 20;
  const lanes = [
    { label: "PLAN", top: planLabelY - 10, bottom: planY + H + 22 },
    { label: "BUILD · PER-SUBTASK LOOP", top: buildLabelY - 10, bottom: buildBottom + 12 },
    { label: "REVIEW → INTEGRATE → RELEASE", top: shipLabelY - 10, bottom: bugY + 14 },
  ];

  return (
    <FitFrame width={width} height={height}>
        {lanes.map((l) => (
          <div
            key={l.label}
            className="absolute rounded-xl border border-gray-800/70 bg-white/[0.02]"
            style={{ left: laneX, top: l.top, width: laneW, height: l.bottom - l.top }}
          />
        ))}
        <svg className="absolute inset-0" width={width} height={height}>
          {edges.map((e, i) => {
            const st = edgeStyle(e);
            let d: string;
            let lx = e.lx, ly = e.ly;
            if (e.pts) {
              d = "M" + e.pts.map((p) => p.join(" ")).join(" L");
            } else {
              const [x1, y1] = right(e.a), [x2, y2] = left(e.b);
              const c = Math.max(30, (x2 - x1) / 2);
              d = `M${x1} ${y1} C${x1 + c} ${y1} ${x2 - c} ${y2} ${x2} ${y2}`;
              lx = e.lx ?? (x1 + x2) / 2;
              ly = e.ly ?? (y1 + y2) / 2;
            }
            return (
              <g key={i}>
                <path d={d} fill="none" stroke={st.stroke} strokeWidth={1.6} strokeDasharray={st.dash} opacity={st.op} />
                {e.label && (
                  <text x={lx} y={(ly ?? 0) - 5} fill="#9ca3af" fontSize={11} fontStyle="italic" textAnchor="middle" paintOrder="stroke" stroke="#0b0d12" strokeWidth={4}>
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {lanes.map((l) => (
          // The lane box's colour behind the text, so a wire passing under a lane title breaks around it.
          <div key={l.label} className="absolute text-[10px] tracking-widest text-gray-500 font-semibold bg-[#101217] px-1 -ml-1" style={{ left: PAD, top: l.top + 10 }}>
            {l.label}
          </div>
        ))}
        {nodes.map((n) => n.el)}
    </FitFrame>
  );
}

/**
 * The graph's frame. It opens fitted: scaled down to the panel's width (never
 * up) and centered. "Actual size" shows it at 100% with the sideways scroll.
 */
function FitFrame({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(width);
  const [fit, setFit] = useState(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setAvailable(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = fit && available > 0 ? Math.min(1, available / width) : 1;
  return (
    <div className="relative rounded-lg border border-gray-800 bg-[#0b0d12] [background-image:radial-gradient(#1f2937_1px,transparent_1px)] [background-size:18px_18px]">
      <div ref={ref} className={fit ? "overflow-hidden" : "overflow-x-auto"}>
        <div className="mx-auto" style={{ width: width * scale, height: height * scale }}>
          <div className="relative origin-top-left" style={{ width, height, transform: scale < 1 ? `scale(${scale})` : undefined }}>
            {children}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setFit((f) => !f)}
        className="absolute bottom-3 right-3 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-gray-700 bg-gray-900/90 text-gray-300 hover:text-white hover:border-gray-600"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        {fit ? "Actual size" : "Fit graph"}
      </button>
    </div>
  );
}

export function RunLegend() {
  return (
    <div className="flex gap-3 text-[11px] text-gray-500">
      <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> done</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> current</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> stopped</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full border border-dashed border-gray-500" /> not reached</span>
    </div>
  );
}
