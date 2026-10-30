import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownDescription } from "@/components/MarkdownDescription";
import { useTaskDraft } from "@/components/TaskFields";
import { CommentsSection, typeBadgeFor } from "@/components/TaskDetailPanel";
import { useProjects } from "@/hooks/useProjects";
import { usePeople } from "@/hooks/usePeople";
import { useTasks, useUpdateTask } from "@/hooks/useTasks";
import { statusOptionsForType } from "@/features/boards/shared/boardConstants";
import { ProgressBar } from "@/features/boards/shared/TaskBoardGroupedKanban";
import { epicProgress } from "@/lib/epicProgress";
import { isStoryLevel } from "@/lib/storyLevel";
import { cn } from "@/lib/utils";
import type { Project, Task } from "@/types";

// The page of a Factory epic (FB-224): its Stories with their stage, the
// derived progress and the close/cancel control. An epic is never built, so
// there is no Subtasks, Run or PR section. Legacy epics keep the slide-over.

const H3 = "text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3";
const CARD = "rounded-lg border border-gray-800 bg-gray-900 p-4";

function statusLabel(task: Task): string {
  return statusOptionsForType(task, "factory").find((o) => o.value === task.status)?.label ?? task.status;
}

function EpicStories({ project, stories }: { project: Project; stories: Task[] }) {
  if (stories.length === 0) return <p className="text-sm text-gray-500">No Stories in this epic yet.</p>;
  return (
    <ul className="divide-y divide-gray-800" aria-label="Stories">
      {stories.map((s) => {
        const key = `${project.key}-${s.task_number}`;
        return (
          <li key={s.id}>
            <Link
              to={`/story/${key}`}
              className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
            >
              <span className="text-xs font-mono text-gray-500 w-16 shrink-0">{key}</span>
              <span className={cn("flex-1 min-w-0 truncate text-sm", s.status === "canceled" ? "text-gray-500 line-through" : "text-gray-200")}>
                {s.title}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700 shrink-0">
                {statusLabel(s)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function LifecycleControl({ epic }: { epic: Task }) {
  const updateTask = useUpdateTask();
  if (epic.status !== "todo") return null;
  const move = (status: "done" | "canceled") => updateTask.mutate({ id: epic.id, payload: { status } });
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        onClick={() => move("done")}
        disabled={updateTask.isPending}
        className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-500 text-white"
      >
        Close
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => move("canceled")}
        disabled={updateTask.isPending}
        className="h-7 px-3 text-xs border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
      >
        Cancel
      </Button>
    </div>
  );
}

export function EpicPage() {
  const { key = "" } = useParams<{ key: string }>();
  const navigate = useNavigate();
  const projectKey = key.slice(0, key.lastIndexOf("-")).toUpperCase();
  const number = Number(key.slice(key.lastIndexOf("-") + 1));

  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.key === projectKey);
  const { data: tasks } = useTasks(project ? { project_id: project.id } : undefined);
  const { data: people = [] } = usePeople();
  const epic = tasks?.find((t) => t.task_number === number && t.type === "epic");
  const { draft, setDraft, save } = useTaskDraft(epic);

  if (projects && !project) return <p className="text-sm text-gray-500">No project has the key {projectKey}.</p>;
  if (project && project.ladder !== "factory") return <p className="text-sm text-gray-500">{project.name} is not a Factory project.</p>;
  if (tasks && !epic) return <p className="text-sm text-gray-500">{key} is not an epic.</p>;
  if (!project || !tasks || !epic) return <p className="text-sm text-gray-500">Loading…</p>;

  const typeBadge = typeBadgeFor(epic);
  const stories = tasks.filter((t) => t.epic_id === epic.id && isStoryLevel(t, "factory"));
  const progress = epicProgress(epic.id, tasks);

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-mono text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{project.key}-{epic.task_number}</span>
        <span className={cn("flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full", typeBadge.cls)}>
          {typeBadge.icon}
          {typeBadge.label}
        </span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
          {statusLabel(epic)}
        </span>
        <div className="ml-auto">
          <LifecycleControl epic={epic} />
        </div>
      </div>
      <input
        value={draft.title}
        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        onBlur={() => {
          const t = draft.title.trim();
          if (t && t !== epic.title) save({ title: t });
        }}
        aria-label="Title"
        className="w-full mt-2 mb-6 bg-transparent text-2xl font-semibold text-white focus:outline-none border-b border-transparent focus:border-gray-700 pb-1 transition-colors"
      />

      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-6">
          <section className={CARD}>
            <h3 className={H3}>Stories</h3>
            <EpicStories project={project} stories={stories} />
          </section>
          <section className={CARD}>
            <h3 className={H3}>Description</h3>
            <MarkdownDescription
              value={draft.description}
              onChange={(description) => setDraft((d) => ({ ...d, description }))}
              onCommit={() => {
                if (draft.description !== epic.description) save({ description: draft.description });
              }}
            />
          </section>
          <section className={CARD}>
            <CommentsSection taskId={epic.id} people={people} />
          </section>
        </div>

        <aside className="w-80 shrink-0">
          <section className={cn(CARD, "space-y-3")} aria-label="Progress">
            <h3 className={H3}>Progress</h3>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Tested</span>
              <ProgressBar done={progress.tested} total={progress.total} />
            </div>
            <dl className="grid grid-cols-2 gap-y-1 text-xs">
              <dt className="text-gray-500">Building</dt>
              <dd className="text-right text-gray-300 tabular-nums">{progress.stages.building}</dd>
              <dt className="text-gray-500">Tested</dt>
              <dd className="text-right text-gray-300 tabular-nums">{progress.stages.tested}</dd>
              <dt className="text-gray-500">Done</dt>
              <dd className="text-right text-gray-300 tabular-nums">{progress.stages.done}</dd>
              <dt className="text-gray-500">Points left</dt>
              <dd className="text-right text-gray-300 tabular-nums">{progress.pointsLeft}</dd>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
