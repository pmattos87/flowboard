import { useState } from "react";
import { Plus } from "lucide-react";
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
import { NewReleaseDialog } from "./NewReleaseDialog";
import type { ReleaseState, ReleaseSummary, Task } from "@/types";

const SECTIONS: { state: ReleaseState; label: string }[] = [
  { state: "planned", label: "Planned" },
  { state: "user_testing", label: "User testing" },
  { state: "released", label: "Released" },
  { state: "canceled", label: "Canceled" },
];

const linkButton = "text-xs text-blue-400 hover:text-blue-300 disabled:text-gray-600";
const listClasses = "divide-y divide-gray-700";
const rowClasses = "flex items-center gap-2 py-1.5 text-sm hover:bg-gray-700/40";

/** A planned or user_testing Release: its picks, and the tested Stories it can take. */
function OpenRelease({ projectKey, release, candidates }: { projectKey: string; release: ReleaseSummary; candidates: Task[] }) {
  const { data } = useRelease(projectKey, release.version);
  const pick = usePickReleaseStory();
  const remove = useRemoveReleaseStory();
  const busy = pick.isPending || remove.isPending;

  return (
    <div className="mt-3 space-y-3">
      <ul className={listClasses}>
        {(data?.stories ?? []).map((s) => (
          <li key={s.key} className={`${rowClasses} text-gray-200`}>
            <span className="font-mono text-xs text-gray-400 shrink-0">{s.key}</span>
            <span className="shrink-0 rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-200">
              {s.status.replace("_", " ")}
            </span>
            <span className="truncate flex-1">{s.title}</span>
            <button type="button" className={`${linkButton} shrink-0`} disabled={busy} onClick={() => remove.mutate(s.key)}>
              Remove
            </button>
          </li>
        ))}
        {data && data.stories.length === 0 && <li className={`${rowClasses} text-gray-500`}>No stories picked yet.</li>}
      </ul>
      {candidates.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Tested, not in a release</p>
          <ul className={listClasses}>
            {candidates.map((t) => {
              const key = `${projectKey}-${t.task_number}`;
              return (
                <li key={t.id} className={`${rowClasses} text-gray-300`}>
                  <span className="font-mono text-xs text-gray-500 shrink-0">{key}</span>
                  <span className="truncate flex-1">{t.title}</span>
                  <button
                    type="button"
                    className={`${linkButton} shrink-0`}
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
    (t) => t.type === "story" && t.parent_id === null && t.status === "tested" && t.release_id === null,
  );

  return (
    <div className="flex flex-col h-full">
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
              <h2 className="text-xs uppercase tracking-wide text-gray-400 mb-2">{label}</h2>
              <ul className="space-y-3">
                {inState.map((r) => (
                  <li key={r.version} className="rounded-lg bg-gray-800 border border-gray-700 p-4">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-white">{r.version}</span>
                      <span className="text-xs text-gray-400">
                        {r.stories} {r.stories === 1 ? "story" : "stories"}
                      </span>
                      {r.released_at && (
                        <span className="text-xs text-gray-500">released {r.released_at.slice(0, 10)}</span>
                      )}
                    </div>
                    {(state === "planned" || state === "user_testing") && (
                      <OpenRelease projectKey={project.key} release={r} candidates={candidates} />
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
