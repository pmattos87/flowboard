import { useEffect } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useSprints } from "@/hooks/useSprints";

interface SprintFilterSelectProps {
  projectId: number;
}

export function SprintFilterSelect({ projectId }: SprintFilterSelectProps) {
  const { data: sprints } = useSprints(projectId);
  const boardSprintFilter = useUiStore((s) => s.boardSprintFilter);
  const setBoardSprintFilter = useUiStore((s) => s.setBoardSprintFilter);
  const ensureDefaultSprintFilter = useUiStore((s) => s.ensureDefaultSprintFilter);

  // Default the filter to the active sprint, once per project.
  useEffect(() => {
    if (!sprints) return;
    const activeSprintId = sprints.find((s) => s.status === "active")?.id ?? null;
    ensureDefaultSprintFilter(projectId, activeSprintId);
  }, [projectId, sprints, ensureDefaultSprintFilter]);

  const value =
    boardSprintFilter === "all" || boardSprintFilter === "backlog"
      ? boardSprintFilter
      : String(boardSprintFilter);

  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "all" || v === "backlog") {
          setBoardSprintFilter(v);
        } else {
          setBoardSprintFilter(Number(v));
        }
      }}
      className="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
      aria-label="Sprint filter"
    >
      <option value="all">All sprints</option>
      {/* FB-91: display-only rename — the filter value stays "backlog". */}
      <option value="backlog">Ready for Development (no sprint)</option>
      {(sprints ?? []).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
          {s.status === "active" ? " (active)" : ""}
        </option>
      ))}
    </select>
  );
}
