import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useTasks } from "@/hooks/useTasks";
import { usePeople } from "@/hooks/usePeople";
import type { TaskListFilters } from "@/lib/commands";

interface Props {
  projectId: number;
  sprintId?: number | null;
}

export function WorkloadChart({ projectId, sprintId }: Props) {
  const filters: TaskListFilters =
    sprintId != null
      ? { project_id: projectId, sprint_id: sprintId }
      : { project_id: projectId };

  const { data: tasks = [], isLoading: tasksLoading } = useTasks(filters);
  const { data: people = [], isLoading: peopleLoading } = usePeople();

  const chartData = useMemo(() => {
    const personMap = new Map(people.map((p) => [p.id, p.name]));
    const groups = new Map<string, { tasks: number; points: number }>();

    for (const t of tasks) {
      const name =
        t.assignee_id != null
          ? (personMap.get(t.assignee_id) ?? "Unknown")
          : "Unassigned";
      const prev = groups.get(name) ?? { tasks: 0, points: 0 };
      groups.set(name, {
        tasks: prev.tasks + 1,
        points: prev.points + t.story_points,
      });
    }

    return Array.from(groups.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.tasks - a.tasks);
  }, [tasks, people]);

  if (tasksLoading || peopleLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }
  if (chartData.length === 0) {
    return <p className="text-sm text-gray-500">No tasks to display.</p>;
  }

  const chartHeight = Math.max(260, chartData.length * 52);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart layout="vertical" data={chartData}>
        <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
        <XAxis
          type="number"
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={100}
          tick={{ fill: "#9ca3af", fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{
            background: "#1f2937",
            border: "1px solid #374151",
            color: "#fff",
          }}
        />
        <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
        <Bar
          dataKey="tasks"
          fill="#60a5fa"
          name="Tasks"
          radius={[0, 4, 4, 0]}
        />
        <Bar
          dataKey="points"
          fill="#fbbf24"
          name="Story Points"
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
