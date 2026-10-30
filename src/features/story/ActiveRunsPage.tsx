import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshButton } from "@/components/RefreshButton";
import { useActiveRuns } from "@/hooks/useStory";
import { statusOptionsForType } from "@/features/boards/shared/boardConstants";
import { cn } from "@/lib/utils";
import { StoryFlags } from "./StoryFlags";

// Every Factory Story with a Run under way, across projects (SF-62): `ready`
// in a sprint through `user_testing`. Stopped Runs come first; "Needs Pedro"
// keeps only the Stories assigned to him. There is no separate inbox.

const STAGE_LABEL = Object.fromEntries(statusOptionsForType({ type: "story", parent_id: null }, "factory").map((o) => [o.value, o.label]));

/** "4d", "3h", "12m": how long since the Story entered its Stage. */
export function timeInStage(since: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(since).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function ActiveRunsPage() {
  const navigate = useNavigate();
  const { data: runs, isLoading } = useActiveRuns();
  const [needsPedro, setNeedsPedro] = useState(false);
  const shown = (runs ?? []).filter((r) => !needsPedro || r.needs_pedro);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-white">Active Runs</h1>
          <RefreshButton />
        </div>
        <button
          type="button"
          aria-pressed={needsPedro}
          onClick={() => setNeedsPedro((v) => !v)}
          className={cn(
            "ml-auto text-xs px-3 py-1.5 rounded-full border transition-colors",
            needsPedro
              ? "bg-blue-600/20 text-blue-300 border-blue-500/60"
              : "bg-transparent text-gray-400 border-gray-700 hover:text-gray-200",
          )}
        >
          Needs Pedro
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
          {needsPedro ? "Nothing is waiting on Pedro." : "No Runs under way."}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-950/60 text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Story</th>
                <th className="text-left font-semibold px-4 py-2">Stage</th>
                <th className="text-left font-semibold px-4 py-2">Flag</th>
                <th className="text-left font-semibold px-4 py-2">Whose move</th>
                <th className="text-right font-semibold px-4 py-2">In Stage</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.key}
                  onClick={() => navigate(`/story/${r.key}`)}
                  className="border-t border-gray-800 hover:bg-gray-800/50 cursor-pointer"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-mono text-gray-500 shrink-0">{r.key}</span>
                      <span className="text-gray-100 truncate">{r.title}</span>
                    </div>
                    <div className="text-[11px] text-gray-500">{r.project}</div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-300">{STAGE_LABEL[r.status] ?? r.status}</td>
                  <td className="px-4 py-2.5">
                    <StoryFlags stopped={r.flags.stopped} waitingOnBugs={r.flags.waiting_on_bugs} />
                  </td>
                  <td className={cn("px-4 py-2.5", r.needs_pedro ? "text-blue-300" : "text-gray-400")}>{r.assignee ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400" title={r.stage_entered_at}>
                    {timeInStage(r.stage_entered_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
