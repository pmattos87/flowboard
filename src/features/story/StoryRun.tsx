import { useMemo } from "react";
import { useTasks } from "@/hooks/useTasks";
import { useStoryTrail } from "@/hooks/useStory";
import type { Project, Task } from "@/types";
import { runGraph } from "./runGraph";
import { RunGraphView, RunLegend } from "./RunGraphView";

// The lower half of the Story page (SF-62): the Run node graph.

const H3 = "text-xs font-semibold text-gray-400 uppercase tracking-wider";

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
    <section className="mt-6">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className={H3}>Run</h3>
        <RunLegend />
      </div>
      <RunGraphView graph={graph} />
    </section>
  );
}
