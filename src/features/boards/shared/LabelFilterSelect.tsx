import { selectLabelFilter, useUiStore } from "@/stores/uiStore";
import { useProjectLabels } from "@/hooks/useProjectLabels";

const ALL = "";

/** One project's label filter (FB-99): lists that project's labels, kept per project in uiStore. */
export function LabelFilterSelect({ projectId }: { projectId: number }) {
  const { data: labels = [] } = useProjectLabels(projectId);
  const labelFilter = useUiStore(selectLabelFilter(projectId));
  const setLabelFilter = useUiStore((s) => s.setLabelFilter);

  // A chosen label no card carries any more still filters the board, so keep it
  // listed rather than showing "All labels" over an empty board.
  const options = labelFilter !== null && !labels.includes(labelFilter) ? [labelFilter, ...labels] : labels;

  return (
    <select
      value={labelFilter ?? ALL}
      onChange={(e) => setLabelFilter(projectId, e.target.value === ALL ? null : e.target.value)}
      className="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
      aria-label="Label filter"
    >
      <option value={ALL}>All labels</option>
      {options.map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
    </select>
  );
}
