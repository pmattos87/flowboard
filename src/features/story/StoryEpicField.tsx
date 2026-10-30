import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { useUpdateTask } from "@/hooks/useTasks";
import type { Project, Task } from "@/types";

/**
 * The Story page header's Epic picker (FB-224): the project's open epics plus
 * "None". The backend enforces membership; a refused change is toasted by
 * `useUpdateTask` and the picker falls back to the saved epic. A done or
 * canceled Story's epic is frozen, so its picker is disabled.
 */
export function StoryEpicField({ story, project, tasks }: { story: Task; project: Project; tasks: Task[] }) {
  const updateTask = useUpdateTask();
  const [value, setValue] = useState<number | null>(story.epic_id);
  useEffect(() => setValue(story.epic_id), [story.epic_id]);

  const open = tasks.filter((t) => t.type === "epic" && t.status === "todo" && t.project_id === story.project_id);
  // A Story can still sit in an epic that has since closed; keep it visible.
  const current = story.epic_id != null && !open.some((e) => e.id === story.epic_id)
    ? tasks.find((t) => t.id === story.epic_id)
    : undefined;
  const frozen = story.status === "done" || story.status === "canceled";
  const label = (e: Task) => `${project.key}-${e.task_number} ${e.title}`;

  return (
    <label className="flex items-center gap-1 text-[11px] pl-2 pr-1 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700 focus-within:ring-1 focus-within:ring-blue-400">
      <Layers className="h-3 w-3 text-purple-400" aria-hidden />
      Epic:
      <select
        aria-label="Epic"
        value={value ?? ""}
        disabled={frozen}
        title={frozen ? "A done or canceled Story keeps its epic" : undefined}
        onChange={(e) => {
          const epicId = e.target.value ? Number(e.target.value) : null;
          setValue(epicId);
          updateTask.mutate(
            { id: story.id, payload: { epic_id: epicId } },
            { onError: () => setValue(story.epic_id) },
          );
        }}
        className="max-w-56 truncate bg-transparent text-gray-300 focus:outline-none disabled:cursor-not-allowed disabled:text-gray-500"
      >
        <option value="" className="bg-gray-800">None</option>
        {current && (
          <option value={current.id} className="bg-gray-800">
            {label(current)} ({current.status})
          </option>
        )}
        {open.map((e) => (
          <option key={e.id} value={e.id} className="bg-gray-800">
            {label(e)}
          </option>
        ))}
      </select>
    </label>
  );
}
