import { useMemo } from "react";
import { usePeople } from "@/hooks/usePeople";
import { useTasks } from "@/hooks/useTasks";
import { useStoryTrail } from "@/hooks/useStory";
import { KanbanBoard } from "@/features/boards/shared/KanbanBoard";
import { FACTORY_SUBTASK_COLUMNS } from "@/features/boards/shared/boardConstants";
import type { CardDecor } from "@/features/boards/shared/TaskCard";
import type { Task } from "@/types";
import { isSubtaskStopped, subtaskRunInfo, type SubtaskRunInfo } from "./subtaskRun";

// The Story's Subtasks as a mini kanban (SF-61). On Factory projects this is
// where the Task board went. Cards are read-only while the Story is building,
// since the Orchestrator moves them then; a click opens the detail panel.

function RoundPills({ rounds }: { rounds: SubtaskRunInfo["rounds"] }) {
  return (
    <span className="flex gap-1">
      {rounds.map((r, i) => (
        <span
          key={i}
          className={
            r === "pass"
              ? "text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400 border border-emerald-800"
              : "text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-800"
          }
        >
          r{i + 1} {r === "pass" ? "✓" : "✗"}
        </span>
      ))}
    </span>
  );
}

interface StorySubtasksProps {
  story: Task;
  storyKey: string;
  projectKey: string;
}

export function StorySubtasks({ story, storyKey, projectKey }: StorySubtasksProps) {
  const { data: tasks } = useTasks({ project_id: story.project_id });
  const { data: people = [] } = usePeople();
  const { data: trail } = useStoryTrail(storyKey);
  const info = useMemo(() => subtaskRunInfo(trail ?? []), [trail]);

  const subtasks = (tasks ?? []).filter((t) => t.parent_id === story.id);
  if (subtasks.length === 0) return <p className="text-xs text-gray-500">No Subtasks yet.</p>;

  const building = story.status === "building";
  const decorate = (t: Task): CardDecor => {
    const run = info[`${projectKey}-${t.task_number}`];
    const who = [run?.agent, run?.model].filter(Boolean).join(" · ");
    return {
      dragDisabled: building,
      badges: isSubtaskStopped(story.run_stopped, run) ? (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-800">
          stopped
        </span>
      ) : undefined,
      meta:
        who || (run?.rounds.length ?? 0) > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {who && <span className="text-[11px] text-teal-400">{who}</span>}
            {run && <RoundPills rounds={run.rounds} />}
          </div>
        ) : undefined,
    };
  };

  return (
    <div>
      {building && (
        <p className="text-[11px] text-gray-500 mb-2">Read-only while the Story is building.</p>
      )}
      <KanbanBoard
        tasks={subtasks}
        people={people}
        projectKey={projectKey}
        columns={FACTORY_SUBTASK_COLUMNS}
        decorate={decorate}
      />
    </div>
  );
}
