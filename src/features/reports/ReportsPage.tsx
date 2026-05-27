import { useState, type ReactNode } from "react";
import { useSprints } from "@/hooks/useSprints";
import { useUiStore } from "@/stores/uiStore";
import { BurndownChart } from "./BurndownChart";
import { VelocityChart } from "./VelocityChart";
import { StatusDistributionChart } from "./StatusDistributionChart";
import { WorkloadChart } from "./WorkloadChart";
import { cn } from "@/lib/utils";
import type { Sprint } from "@/types";

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-white mb-4">{title}</h2>
      {children}
    </div>
  );
}

export default function ReportsPage() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const { data: sprints = [], isLoading } = useSprints(
    activeProjectId ?? undefined,
  );
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);

  if (activeProjectId == null) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold text-white">Reports</h1>
        <p className="mt-2 text-sm text-gray-500">
          Select a project from the sidebar to view its reports.
        </p>
      </div>
    );
  }

  const selectedSprint: Sprint | undefined = sprints.find(
    (s) => s.id === selectedSprintId,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Reports</h1>
        <select
          value={selectedSprintId ?? ""}
          onChange={(e) =>
            setSelectedSprintId(e.target.value ? Number(e.target.value) : null)
          }
          className={cn(
            "w-48 rounded-md border border-gray-700 bg-gray-800",
            "px-3 py-1.5 text-sm text-gray-200",
            "focus:outline-none focus:ring-1 focus:ring-blue-500",
          )}
          aria-label="Sprint filter"
        >
          <option value="">All sprints</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ChartCard title="Burndown">
            {selectedSprint != null ? (
              <BurndownChart sprint={selectedSprint} />
            ) : (
              <p className="text-sm text-gray-500">
                Select a sprint to view the burndown chart.
              </p>
            )}
          </ChartCard>

          <ChartCard title="Velocity">
            <VelocityChart projectId={activeProjectId} />
          </ChartCard>

          <ChartCard title="Status Distribution">
            <StatusDistributionChart
              projectId={activeProjectId}
              sprintId={selectedSprintId}
            />
          </ChartCard>

          <ChartCard title="Workload">
            <WorkloadChart
              projectId={activeProjectId}
              sprintId={selectedSprintId}
            />
          </ChartCard>
        </div>
      )}
    </div>
  );
}
