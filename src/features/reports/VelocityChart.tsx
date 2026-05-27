import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useSprints } from "@/hooks/useSprints";
import { useTasks } from "@/hooks/useTasks";

interface Props {
  projectId: number;
}

export function VelocityChart({ projectId }: Props) {
  const { data: sprints = [], isLoading: sprintsLoading } = useSprints(projectId);
  const { data: tasks = [], isLoading: tasksLoading } = useTasks({
    project_id: projectId,
  });

  const chartData = useMemo(() => {
    const completed = sprints.filter((s) => s.status === "completed");
    return completed.map((s) => {
      const points = tasks
        .filter((t) => t.sprint_id === s.id && t.status === "done")
        .reduce((sum, t) => sum + t.story_points, 0);
      return { name: s.name, points };
    });
  }, [sprints, tasks]);

  if (sprintsLoading || tasksLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }
  if (chartData.length === 0) {
    return <p className="text-sm text-gray-500">No completed sprints yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData}>
        <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} />
        <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: "#1f2937",
            border: "1px solid #374151",
            color: "#fff",
          }}
        />
        <Bar
          dataKey="points"
          fill="#34d399"
          name="Story Points"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
