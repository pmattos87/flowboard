import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { useUiStore } from "@/stores/uiStore";
import { useProject } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";
import {
  usePickReleaseStory,
  useRelease,
  useReleases,
  useRemoveReleaseStory,
} from "@/hooks/useReleases";
import { RefreshButton } from "@/components/RefreshButton";
import { Button } from "@/components/ui/button";
import { TYPE_META } from "@/features/boards/shared/boardConstants";
import { isStoryLevel } from "@/lib/storyLevel";
import { NewReleaseDialog } from "./NewReleaseDialog";
import type { ReleaseState, ReleaseSummary, Task, TaskType } from "@/types";

const SECTIONS: { state: ReleaseState; label: string }[] = [
  { state: "planned", label: "Planned" },
  { state: "user_testing", label: "User testing" },
  { state: "released", label: "Released" },
  { state: "canceled", label: "Canceled" },
];

const GRID = "grid grid-cols-[minmax(0,1fr)_9rem_6rem] items-center gap-3";
const GRID_NO_ACTION = "grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3";
const outlineButton =
  "justify-self-start rounded-md border border-gray-600 px-2.5 py-1 text-xs text-gray-200 hover:bg-gray-700 disabled:opacity-50";

interface Tone {
  pill: string;
  dot: string;
}
const EMERALD: Tone = { pill: "bg-emerald-900/40 border-emerald-700 text-emerald-300", dot: "bg-emerald-400" };
const AMBER: Tone = { pill: "bg-amber-900/40 border-amber-700 text-amber-300", dot: "bg-amber-400" };
const GRAY: Tone = { pill: "bg-gray-700/40 border-gray-600 text-gray-300", dot: "bg-gray-400" };

function statusTone(status: string): Tone {
  if (status === "tested" || status === "done") return EMERALD;
  if (status === "building" || status === "integrated_tests" || status === "user_testing") return AMBER;
  return GRAY;
}

function statusLabel(status: string): string {
  const text = status.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${tone.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {label}
    </span>
  );
}

function TableHead({ withAction }: { withAction: boolean }) {
  return (
    <div
      className={`${withAction ? GRID : GRID_NO_ACTION} border-b border-gray-700 pb-2 text-[11px] uppercase tracking-wide text-gray-500`}
    >
      <span>Story</span>
      <span>Status</span>
      {withAction && <span>Action</span>}
    </div>
  );
}

/** Title over key, led by the type icon so a pick reads as a feature or a fix (FB-52). */
function StoryCell({ title, storyKey, type }: { title: string; storyKey: string; type: TaskType }) {
  const { Icon, colorClass } = TYPE_META[type] ?? TYPE_META.story;
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon role="img" aria-label={type === "bug" ? "Bug" : "Story"} className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${colorClass}`} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-100">{title}</p>
        <p className="truncate text-xs text-gray-500">{storyKey}</p>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function storyCount(n: number): string {
  return `${n} ${n === 1 ? "story" : "stories"}`;
}

/** A planned or user_testing Release: its picks, and the tested Stories it can take. */
function OpenRelease({ projectKey, release, candidates }: { projectKey: string; release: ReleaseSummary; candidates: Task[] }) {
  const { data } = useRelease(projectKey, release.version);
  const pick = usePickReleaseStory();
  const remove = useRemoveReleaseStory();
  const busy = pick.isPending || remove.isPending;
  const stories = data?.stories ?? [];

  const counts: { status: string; n: number }[] = [];
  for (const s of stories) {
    const found = counts.find((c) => c.status === s.status);
    if (found) found.n += 1;
    else counts.push({ status: s.status, n: 1 });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-gray-700 pb-3">
        <span className="font-mono text-xl text-white">{release.version}</span>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{storyCount(stories.length)}</span>
          {counts.map((c) => (
            <span key={c.status} className="flex items-center gap-1.5">
              <span aria-hidden>·</span>
              <span className={`h-1.5 w-1.5 rounded-full ${statusTone(c.status).dot}`} />
              <span>
                {c.n} {c.status.replace(/_/g, " ")}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <TableHead withAction />
        <ul className="divide-y divide-gray-700">
          {stories.map((s) => (
            <li key={s.key} className={`${GRID} py-2 hover:bg-gray-700/40`}>
              <StoryCell title={s.title} storyKey={s.key} type={s.type} />
              <div>
                <StatusPill label={statusLabel(s.status)} tone={statusTone(s.status)} />
              </div>
              <button
                type="button"
                className={outlineButton}
                aria-label={`Remove ${s.title} from release`}
                disabled={busy}
                onClick={() => remove.mutate(s.key)}
              >
                Remove
              </button>
            </li>
          ))}
          {data && stories.length === 0 && <li className="py-2 text-sm text-gray-500">No stories picked yet.</li>}
        </ul>
      </div>
      {candidates.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Tested, not in a release</p>
          <ul className="divide-y divide-gray-700">
            {candidates.map((t) => {
              const key = `${projectKey}-${t.task_number}`;
              return (
                <li key={t.id} className={`${GRID} py-2 hover:bg-gray-700/40`}>
                  <StoryCell title={t.title} storyKey={key} type={t.type} />
                  <div>
                    <StatusPill label="Tested" tone={EMERALD} />
                  </div>
                  <button
                    type="button"
                    className={outlineButton}
                    aria-label={`Pick ${t.title} into ${release.version}`}
                    disabled={busy}
                    onClick={() => pick.mutate({ version: release.version, storyKey: key })}
                  >
                    Pick
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The Stories of a closed Release; mounted only when expanded so the fetch waits for it. */
function ClosedStories({ projectKey, version }: { projectKey: string; version: string }) {
  const { data } = useRelease(projectKey, version);
  return (
    <div className="mt-3">
      <TableHead withAction={false} />
      <ul className="divide-y divide-gray-700">
        {(data?.stories ?? []).map((s) => (
          <li key={s.key} className={`${GRID_NO_ACTION} py-2`}>
            <StoryCell title={s.title} storyKey={s.key} type={s.type} />
            <div>
              <StatusPill label={statusLabel(s.status)} tone={statusTone(s.status)} />
            </div>
          </li>
        ))}
        {data && data.stories.length === 0 && <li className="py-2 text-sm text-gray-500">No stories.</li>}
      </ul>
    </div>
  );
}

/** A released or canceled Release: a compact row that expands to its Stories. */
function ClosedRelease({ projectKey, release }: { projectKey: string; release: ReleaseSummary }) {
  const [expanded, setExpanded] = useState(false);
  const released = release.state === "released";
  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${release.version}`}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronRight className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
        <span className="font-mono text-xl text-white">{release.version}</span>
        <span className="text-xs text-gray-400">{storyCount(release.stories)}</span>
        <div className="ml-auto flex items-center gap-3">
          <StatusPill label={released ? "Released" : "Canceled"} tone={released ? EMERALD : GRAY} />
          {released && release.released_at && (
            <span className="text-xs text-gray-500">{formatDate(release.released_at)}</span>
          )}
        </div>
      </div>
      {expanded && <ClosedStories projectKey={projectKey} version={release.version} />}
    </div>
  );
}

export default function ReleasesPage() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const { data: project } = useProject(activeProjectId);
  const { data: tasks } = useTasks(activeProjectId != null ? { project_id: activeProjectId } : undefined);
  const isFactory = project?.ladder === "factory";
  const { data: releases = [] } = useReleases(project?.key, isFactory);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (activeProjectId == null) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Select a project from the sidebar to view its releases.
      </div>
    );
  }
  if (project && !isFactory) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Releases exist only on Factory projects.
      </div>
    );
  }
  if (!project) return null;

  const candidates = (tasks ?? []).filter(
    (t) => isStoryLevel(t, project.ladder) && t.status === "tested" && t.release_id === null,
  );

  return (
    <div data-testid="releases-container" className="flex flex-col h-full mx-auto w-full max-w-6xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-white">Releases</h1>
            <RefreshButton />
          </div>
          <p className="text-xs text-gray-500 mt-1">Pick tested stories into a release before it is promoted.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white">
          <Plus className="w-4 h-4" /> New release
        </Button>
      </div>

      <div className="space-y-6">
        {SECTIONS.map(({ state, label }) => {
          const inState = releases.filter((r) => r.state === state);
          if (inState.length === 0) return null;
          return (
            <section key={state}>
              <h2 className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
                {label}
                <span className="rounded-full bg-gray-700 px-1.5 py-0.5 text-[11px] text-gray-300">{inState.length}</span>
              </h2>
              <ul className="space-y-3">
                {inState.map((r) => (
                  <li key={r.version} className="rounded-lg bg-gray-800 border border-gray-700 p-4">
                    {state === "planned" || state === "user_testing" ? (
                      <OpenRelease projectKey={project.key} release={r} candidates={candidates} />
                    ) : (
                      <ClosedRelease projectKey={project.key} release={r} />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {releases.length === 0 && <p className="text-sm text-gray-500">No releases yet.</p>}
      </div>

      {dialogOpen && (
        <NewReleaseDialog
          projectKey={project.key}
          releases={releases}
          candidates={candidates}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}
