import { useMemo } from "react";
import { toast } from "sonner";
import { useTasks } from "@/hooks/useTasks";
import { useStoryTrail } from "@/hooks/useStory";
import { openGithubUrl } from "@/lib/commands";
import { cn } from "@/lib/utils";
import type { Project, Task, TrailEvent } from "@/types";
import { runGraph } from "./runGraph";
import { RunGraphView, RunLegend } from "./RunGraphView";
import { trailLine, type TrailTone } from "./trailText";

// The lower half of the Story page (SF-62): the Run node graph, then the
// Review rounds and the trail.

const H3 = "text-xs font-semibold text-gray-400 uppercase tracking-wider";
const CARD = "rounded-lg border border-gray-800 bg-gray-900 p-4";

const TONE: Record<TrailTone, string> = {
  stage: "text-blue-300",
  pass: "text-emerald-400",
  fail: "text-red-300",
  stop: "text-red-400",
  info: "text-gray-300",
};

function formatAt(at: string): string {
  if (!at) return "";
  const d = new Date(at);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function field(e: TrailEvent, name: string): string {
  if (typeof e.new !== "object") return "";
  const v = e.new[name];
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}

/** A findings link: a comment on this page, a GitHub page, or plain text. */
function openFindings(url: string) {
  const comment = /^flowboard:\/\/comment\/(\d+)$/.exec(url);
  if (comment) {
    const el = document.getElementById(`comment-${comment[1]}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    else toast.warning("That comment is not on this Story");
    return;
  }
  openGithubUrl(url).catch((err) => toast.error(`Failed to open ${url}: ${String(err)}`));
}

function ReviewRounds({ trail }: { trail: TrailEvent[] }) {
  const rounds = trail.filter((e) => e.action === "review_round");
  return (
    <section className={CARD}>
      <h3 className={cn(H3, "mb-3")}>Review rounds</h3>
      {rounds.length === 0 ? (
        <p className="text-xs text-gray-500">
          Not started. Codex reviews the whole Story once every Subtask has passed Verify.
        </p>
      ) : (
        <div className="space-y-2">
          {rounds.map((e, i) => {
            const passed = field(e, "verdict") === "passed";
            const findings = field(e, "findings_url");
            const linkable = findings.startsWith("flowboard://comment/") || findings.startsWith("https://github.com/");
            return (
              <div key={i} className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-mono text-gray-400 w-8">r{field(e, "round")}</span>
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded border",
                    passed ? "bg-emerald-900/40 text-emerald-400 border-emerald-800" : "bg-red-900/40 text-red-400 border-red-800",
                  )}
                >
                  {passed ? "passed" : "failed"}
                </span>
                <span className="font-mono text-gray-500">{field(e, "commit").slice(0, 7)}</span>
                {findings &&
                  (linkable ? (
                    <button type="button" onClick={() => openFindings(findings)} className="text-blue-400 hover:text-blue-300">
                      findings
                    </button>
                  ) : (
                    <span className="text-gray-500 break-all">{findings}</span>
                  ))}
                <span className="text-gray-600 ml-auto">{formatAt(e.at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Trail({ trail }: { trail: TrailEvent[] }) {
  return (
    <section className={CARD}>
      <h3 className={cn(H3, "mb-3")}>Trail</h3>
      <div className="space-y-2.5">
        {[...trail].reverse().map((e, i) => {
          const line = trailLine(e);
          return (
            <div key={i} className="flex gap-4 text-xs">
              <span className="text-gray-500 w-28 shrink-0">{formatAt(e.at)}</span>
              <div className="min-w-0">
                <div className={TONE[line.tone]}>
                  {line.text}
                  <span className="text-gray-600"> · {e.by}</span>
                </div>
                {line.detail && <div className="text-gray-500 break-words">{line.detail}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface StoryRunProps {
  story: Task;
  storyKey: string;
  project: Project;
}

export function StoryRun({ story, storyKey, project }: StoryRunProps) {
  const { data: tasks } = useTasks({ project_id: story.project_id });
  const { data: trail } = useStoryTrail(storyKey);

  const graph = useMemo(() => {
    const subtasks = (tasks ?? [])
      .filter((t) => t.parent_id === story.id)
      .sort((a, b) => a.task_number - b.task_number);
    return runGraph({
      story,
      subtasks,
      trail: trail ?? [],
      projectKey: project.key,
      clientProject: project.kind === "client",
    });
  }, [tasks, trail, story, project.key, project.kind]);

  return (
    <>
      <section className="mt-6">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className={H3}>Run</h3>
          <RunLegend />
        </div>
        <RunGraphView graph={graph} />
      </section>
      <div className="mt-6 space-y-6">
        <ReviewRounds trail={trail ?? []} />
        <Trail trail={trail ?? []} />
      </div>
    </>
  );
}
