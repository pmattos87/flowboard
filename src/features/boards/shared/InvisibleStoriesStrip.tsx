import { AlertTriangle } from "lucide-react";
import type { Task } from "@/types";
import { useUiStore } from "@/stores/uiStore";

interface InvisibleStoriesStripProps {
  /** The rows `invisibleStories` returned for the active project. */
  stories: Task[];
  projectKey: string;
}

/**
 * FB-93: amber strip under a board's title listing the Stories and epics that
 * render on no board. A key opens the row's detail panel, where its status or
 * sprint can be fixed. Renders nothing when the list is empty.
 */
export function InvisibleStoriesStrip({ stories, projectKey }: InvisibleStoriesStripProps) {
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId);
  if (stories.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Issues on no board"
      data-testid="invisible-stories-strip"
      className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-amber-700/60 bg-gray-950 px-3 py-2 text-sm text-amber-300"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
      <span>
        {stories.length} {stories.length === 1 ? "issue appears" : "issues appear"} on no board:
      </span>
      {stories.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.title}
          onClick={() => setSelectedTaskId(t.id)}
          className="rounded border border-amber-700 bg-amber-900/40 px-1.5 py-0.5 font-mono text-xs text-amber-300 transition-colors hover:bg-amber-900/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {projectKey}-{t.task_number}
        </button>
      ))}
    </div>
  );
}
