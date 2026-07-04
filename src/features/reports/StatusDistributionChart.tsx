import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useTasks } from "@/hooks/useTasks";
import type { TaskListFilters } from "@/lib/commands";

interface Props {
  projectId: number;
  sprintId?: number | null;
}

const STATUS_CONFIG = [
  { key: "todo", label: "To Do", color: "#6b7280" },
  { key: "refining", label: "Refining", color: "#60a5fa" },
  { key: "ready_for_development", label: "Ready for Development", color: "#34d399" },
  { key: "in_progress", label: "In Progress", color: "#60a5fa" },
  { key: "in_review", label: "In Review", color: "#fbbf24" },
  { key: "canceled", label: "Canceled", color: "#475569" },
  { key: "done", label: "Done", color: "#34d399" },
] as const;

export function StatusDistributionChart({ projectId, sprintId }: Props) {
  const filters: TaskListFilters =
    sprintId != null
      ? { project_id: projectId, sprint_id: sprintId }
      : { project_id: projectId };

  const { data: tasks = [], isLoading } = useTasks(filters);

  const chartData = useMemo(
    () =>
      STATUS_CONFIG.map(({ key, label }) => ({
        name: label,
        value: tasks.filter((t) => t.status === key).length,
      })),
    [tasks],
  );

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }
  if (tasks.length === 0) {
    return <p className="text-sm text-gray-500">No tasks to display.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="45%"
          innerRadius={55}
          outerRadius={85}
        >
          {STATUS_CONFIG.map((cfg, i) => (
            <Cell key={cfg.key} fill={STATUS_CONFIG[i].color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: "#1f2937",
            border: "1px solid #374151",
            color: "#fff",
          }}
        />
        <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
