import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useSprintActivityLog } from "@/hooks/useActivityLog";
import { useTasks } from "@/hooks/useTasks";
import type { ActivityLog, Sprint } from "@/types";

interface Props {
  sprint: Sprint;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function eachDayBetween(start: string, end: string): string[] {
  const days: string[] = [];
  let cur = start;
  while (cur <= end) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return days;
}

/** Returns the last status value for a task at or before dayIso, or null if none. */
function lastStatusAtOrBefore(
  taskId: number,
  dayIso: string,
  logs: ActivityLog[],
): string | null {
  const relevant = logs
    .filter(
      (e) =>
        e.task_id === taskId &&
        e.action === "status_changed" &&
        e.created_at.slice(0, 10) <= dayIso,
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return relevant.length > 0 ? relevant[relevant.length - 1].new_value : null;
}

export function BurndownChart({ sprint }: Props) {
  const { data: tasks = [], isLoading: tasksLoading } = useTasks({
    sprint_id: sprint.id,
  });
  const { data: logs = [], isLoading: logsLoading } = useSprintActivityLog(
    sprint.id,
  );

  const chartData = useMemo(() => {
    if (tasks.length === 0) return [];
    const days = eachDayBetween(sprint.start_date, sprint.end_date);
    const total = tasks.length;
    return days.map((day, i) => {
      const done = tasks.filter((t) => {
        const status = lastStatusAtOrBefore(t.id, day, logs) ?? t.status;
        return status === "done";
      }).length;
      const idealRaw = total * (1 - i / Math.max(days.length - 1, 1));
      return {
        day: day.slice(5), // "MM-DD"
        actual: total - done,
        ideal: Math.round(idealRaw),
      };
    });
  }, [tasks, logs, sprint]);

  if (tasksLoading || logsLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }
  if (tasks.length === 0) {
    return <p className="text-sm text-gray-500">No tasks in this sprint.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData}>
        <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
        <XAxis dataKey="day" tick={{ fill: "#9ca3af", fontSize: 11 }} />
        <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: "#1f2937",
            border: "1px solid #374151",
            color: "#fff",
          }}
        />
        <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="ideal"
          stroke="#9ca3af"
          strokeDasharray="4 4"
          dot={false}
          name="Ideal"
        />
        <Line
          type="monotone"
          dataKey="actual"
          stroke="#60a5fa"
          strokeWidth={2}
          dot={false}
          name="Actual"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
