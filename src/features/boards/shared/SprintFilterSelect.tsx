import { useEffect } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useSprints } from "@/hooks/useSprints";

interface SprintFilterSelectProps {
  projectId: number;
  /**
   * Whether to offer the "no sprint" option. Boards that only render the dev
   * workflow (the User Story Board) have nothing to show for unscheduled
   * stories — those live on the Discovery board — so they opt out.
   */
  includeBacklog?: boolean;
}

export function SprintFilterSelect({
  projectId,
  includeBacklog = true,
}: SprintFilterSelectProps) {
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

  // The filter is shared across boards, so it can arrive set to "backlog" from
  // a board that offers it. Fall back rather than leaving the <select> bound to
  // a value it no longer renders.
  useEffect(() => {
    if (!includeBacklog && boardSprintFilter === "backlog") setBoardSprintFilter("all");
  }, [includeBacklog, boardSprintFilter, setBoardSprintFilter]);

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
      {includeBacklog && (
        <option value="backlog">Ready for Development (no sprint)</option>
      )}
      {(sprints ?? []).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
          {s.status === "active" ? " (active)" : ""}
        </option>
      ))}
    </select>
  );
}
