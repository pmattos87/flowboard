import { Bot, Clock, GitBranch, LayoutGrid, Search, Send, Sparkles, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeKind, NodeState, RunGraph, RunNode, SubtaskNode } from "./runGraph";

// The Run node graph on the Story page (SF-62), styled after
// docs/reference/run-view-mockup.png but drawn for this Run: Plan, Build (one
// node per Subtask) and Review → Production, with the findings and bug loops.

const W = 196, H = 56, SW = 196, SH = 50, COL = 250, X0 = 20;

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

  // Plan
  const planY = 38;
  const plan = graph.plan.map((n, i) => place(n, X0 + i * COL, planY));
  plan.slice(1).forEach((b, i) => edges.push({ a: plan[i], b }));

  // Build: Subtasks fan out from the Orchestrator and back into Verify.
  const buildLabelY = 150;
  const subTop = buildLabelY + 32;
  const count = Math.max(graph.subtasks.length, 1);
  const subsHeight = count * (SH + 16) - 16;
  const mid = subTop + subsHeight / 2;
  const orch = place(graph.orchestrator, X0, mid - H / 2);
  const subBoxes: Box[] = graph.subtasks.map((s, i) => {
    const box = { x: 260, y: subTop + i * (SH + 16), w: SW, h: SH, state: s.state };
    nodes.push({ box, el: <SubtaskBox key={s.id} node={s} x={box.x} y={box.y} /> });
    return box;
  });
  const verify = place(graph.verify, 540, mid - H / 2);
  const stop = place(graph.stop, 800, mid - H / 2 - 72);
  const docs = place(graph.docs, 800, mid - H / 2 + 72);
  const start = plan[plan.length - 1];
  const startX = start.x + W / 2;
  edges.push({
    a: start, b: orch, label: "Pedro starts the Run", lx: (startX + X0 + W / 2) / 2, ly: 128,
    pts: [[startX, planY + H], [startX, 128], [X0 + W / 2, 128], [X0 + W / 2, orch.y]],
  });
  if (subBoxes.length === 0) edges.push({ a: orch, b: verify });
  subBoxes.forEach((b) => edges.push({ a: orch, b }, { a: b, b: verify }));
  edges.push({ a: verify, b: stop, label: "fails twice" }, { a: verify, b: docs, label: "all pass" });

  // Review → Integrate → Release → Production
  const buildBottom = Math.max(subTop + subsHeight, docs.y + H + 20);
  const shipLabelY = buildBottom + 40;
  const shipY = shipLabelY + 26;
  const ship = graph.ship.map((n, i) => place(n, X0 + i * COL, shipY));
  const fix = place(graph.fix, X0 + COL, shipY + 118);
  const turnY = shipLabelY - 16;
  edges.push({
    a: docs, b: ship[0], label: "every Subtask verified", lx: 560, ly: turnY,
    pts: [[docs.x + W, docs.y + H / 2], [docs.x + W + 34, docs.y + H / 2], [docs.x + W + 34, turnY], [X0 + W / 2, turnY], [X0 + W / 2, shipY]],
  });
  // Labels sit above the row: the gap between two nodes is narrower than the text.
  const shipLabels: Record<string, string> = { pr: "clean", release: "passed → tested", production: "approved" };
  ship.slice(1).forEach((b, i) =>
    edges.push({ a: ship[i], b, label: shipLabels[graph.ship[i + 1].id], lx: b.x - (COL - W) / 2, ly: shipY - 9 }),
  );
  const findingsLive = graph.fix.state !== "todo";
  edges.push({
    a: ship[0], b: fix, label: "findings", lx: X0 + W / 2 + 42, ly: fix.y + H / 2, loop: "findings", active: findingsLive,
    pts: [[X0 + W / 2, shipY + H], [X0 + W / 2, fix.y + H / 2], [fix.x, fix.y + H / 2]],
  });
  // The findings go back to the builders as a bug Subtask; once it passes
  // Verify, the normal path takes the Story to Review round 2.
  // Out of the node's right side and under its caption, so the line never
  // crosses the caption; the label sits left of the node.
  const fixLoopY = fix.y + H + 28;
  edges.push({
    a: fix, b: orch, loop: "findings", active: findingsLive,
    label: "bug Subtask → rebuild, then re-review", lx: 140, ly: fixLoopY,
    pts: [
      [fix.x + W, fix.y + H / 2], [fix.x + W + 18, fix.y + H / 2], [fix.x + W + 18, fixLoopY],
      [14, fixLoopY], [14, orch.y + H / 2 + 12], [orch.x, orch.y + H / 2 + 12],
    ],
  });
  const integrated = ship.find((_, i) => graph.ship[i].id === "integrated") ?? ship[0];
  const bugY = fixLoopY + 22;
  edges.push({
    a: integrated, b: orch, loop: "bug", active: graph.bugLoop,
    label: "bug found → bug Subtask, Story holds", lx: (integrated.x + W / 2) / 2 + 40, ly: bugY,
    pts: [[integrated.x + W / 2, shipY + H], [integrated.x + W / 2, bugY], [6, bugY], [6, orch.y + H / 2], [orch.x, orch.y + H / 2]],
  });

  const width = Math.max(...nodes.map((n) => n.box.x + n.box.w)) + 30;
  const height = bugY + 24;
  const lanes = [
    { y: 12, label: "PLAN" },
    { y: buildLabelY, label: "BUILD · PER-SUBTASK LOOP" },
    { y: shipLabelY, label: "REVIEW → INTEGRATE → RELEASE" },
  ];

  return (
    <div className="rounded-lg border border-gray-800 bg-[#0b0d12] overflow-x-auto [background-image:radial-gradient(#1f2937_1px,transparent_1px)] [background-size:18px_18px]">
      <div className="relative" style={{ width, height }}>
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
          <div key={l.label} className="absolute text-[10px] tracking-widest text-gray-500 font-semibold" style={{ left: X0, top: l.y }}>
            {l.label}
          </div>
        ))}
        {nodes.map((n) => n.el)}
      </div>
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
