import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownDescription } from "@/components/MarkdownDescription";
import { TaskFields, useTaskDraft } from "@/components/TaskFields";
import { AttachmentsSection, CommentsSection, TYPE_BADGE } from "@/components/TaskDetailPanel";
import { useProjects } from "@/hooks/useProjects";
import { usePeople } from "@/hooks/usePeople";
import { useTasks } from "@/hooks/useTasks";
import { useRestartRun, useStory, useStoryTrail } from "@/hooks/useStory";
import { statusOptionsForType } from "@/features/boards/shared/boardConstants";
import { cn } from "@/lib/utils";
import type { StoryView, TrailEvent } from "@/types";
import { StoryFlags } from "./StoryFlags";
import { StorySubtasks } from "./StorySubtasks";

// The dedicated Story page of a Factory project (SF-61). It replaces the
// detail slide-over for Stories there; legacy projects keep the slide-over.

const H3 = "text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3";
const CARD = "rounded-lg border border-gray-800 bg-gray-900 p-4";

function LinkField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-gray-500 text-[11px]">{label}</div>
      <div
        className={cn(
          "min-h-8 flex items-center px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-gray-200 text-sm break-all select-text",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function LinksCard({ story }: { story: StoryView }) {
  const review = story.review.verdict
    ? `${story.review.verdict}${story.review.commit ? ` · ${story.review.commit.slice(0, 7)}` : ""}`
    : "— not reviewed";
  return (
    <section className={CARD}>
      <h3 className={H3}>Links</h3>
      <div className="space-y-2">
        <LinkField label="Feature branch" value={story.feature_branch ?? "— not cut"} mono={story.feature_branch != null} />
        <LinkField
          label="PR"
          value={story.prs.length > 0 ? story.prs.map((p) => `${p.url} (${p.state} → ${p.target})`).join("\n") : "— not opened"}
          mono={story.prs.length > 0}
        />
        <LinkField label="Review verdict" value={review} />
        <LinkField
          label="Release"
          value={story.release ? `${story.release.version} · ${story.release.state.replace("_", " ")}` : "— not picked"}
        />
        <LinkField label="Depends on" value={story.depends_on.length > 0 ? story.depends_on.join(", ") : "—"} />
      </div>
    </section>
  );
}

/** The reason of the latest `run_stopped` event, if the trail records one. */
function stopReason(trail: TrailEvent[] | undefined): string | null {
  const last = [...(trail ?? [])].reverse().find((e) => e.action === "run_stopped");
  if (!last || typeof last.new !== "object") return null;
  const reason = last.new.reason;
  return typeof reason === "string" ? reason : null;
}

function StoppedRunBox({ story }: { story: StoryView }) {
  const { data: trail } = useStoryTrail(story.key);
  const restart = useRestartRun();
  const reason = stopReason(trail);
  return (
    <section className="rounded-lg border border-red-800 bg-red-950/40 p-4">
      <div className="text-red-300 font-medium">Run stopped</div>
      {reason && <div className="text-xs text-gray-400 mt-1 whitespace-pre-wrap">{reason}</div>}
      <Button
        size="sm"
        onClick={() => restart.mutate(story.key)}
        disabled={restart.isPending}
        className="mt-3 h-7 px-3 text-xs bg-blue-600 hover:bg-blue-500 text-white"
      >
        {restart.isPending ? "Restarting…" : "Restart Run"}
      </Button>
    </section>
  );
}

export function StoryPage() {
  const { key = "" } = useParams<{ key: string }>();
  const navigate = useNavigate();
  const projectKey = key.slice(0, key.lastIndexOf("-")).toUpperCase();
  const number = Number(key.slice(key.lastIndexOf("-") + 1));

  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.key === projectKey);
  const { data: tasks } = useTasks(project ? { project_id: project.id } : undefined);
  const { data: people = [] } = usePeople();
  const task = project ? tasks?.find((t) => t.task_number === number && t.type === "story") : undefined;
  const isFactory = project?.ladder === "factory";
  const { data: story, error } = useStory(key, isFactory && task != null);
  const draftState = useTaskDraft(task);
  const { draft, setDraft, save } = draftState;

  if (projects && !project) return <p className="text-sm text-gray-500">No project has the key {projectKey}.</p>;
  if (project && !isFactory) return <p className="text-sm text-gray-500">{project.name} is not a Factory project.</p>;
  if (tasks && !task) return <p className="text-sm text-gray-500">{key} is not a Story.</p>;
  if (error) return <p className="text-sm text-red-400">Failed to load {key}: {String(error)}</p>;
  if (!task || !story) return <p className="text-sm text-gray-500">Loading…</p>;

  const typeBadge = TYPE_BADGE[task.type];
  const statusLabel =
    statusOptionsForType(task.type, "factory").find((o) => o.value === task.status)?.label ?? task.status;

  return (
    <div className="max-w-7xl mx-auto">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-mono text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{story.key}</span>
        <span className={cn("flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full", typeBadge.cls)}>
          {typeBadge.icon}
          {typeBadge.label}
        </span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
          {statusLabel}
        </span>
        <StoryFlags stopped={story.flags.stopped} waitingOnBugs={story.flags.waiting_on_bugs} />
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
          Assignee: {story.assignee ?? "—"}
        </span>
      </div>
      <input
        value={draft.title}
        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        onBlur={() => {
          const t = draft.title.trim();
          if (t && t !== task.title) save({ title: t });
        }}
        aria-label="Title"
        className="w-full mt-2 mb-6 bg-transparent text-2xl font-semibold text-white focus:outline-none border-b border-transparent focus:border-gray-700 pb-1 transition-colors"
      />

      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-6">
          <section className={CARD}>
            <h3 className={H3}>Description</h3>
            <MarkdownDescription
              value={draft.description}
              onChange={(description) => setDraft((d) => ({ ...d, description }))}
              onCommit={() => {
                if (draft.description !== task.description) save({ description: draft.description });
              }}
            />
          </section>
          <section className={CARD}>
            <h3 className={H3}>Subtasks</h3>
            <StorySubtasks story={task} storyKey={story.key} projectKey={projectKey} />
          </section>
          <section className={CARD}>
            <CommentsSection taskId={task.id} people={people} />
          </section>
        </div>

        <aside className="w-80 shrink-0 space-y-6">
          {story.flags.stopped && <StoppedRunBox story={story} />}
          <section className={cn(CARD, "space-y-2")}>
            <h3 className={H3}>Details</h3>
            <TaskFields task={task} state={draftState} />
          </section>
          <LinksCard story={story} />
          <section className={CARD}>
            <AttachmentsSection taskId={task.id} />
          </section>
        </aside>
      </div>
    </div>
  );
}
