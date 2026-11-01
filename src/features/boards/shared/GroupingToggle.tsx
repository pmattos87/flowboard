import { Columns3, Layers } from "lucide-react";
import type { DiscoveryGrouping, StoryBoardGrouping } from "@/stores/uiStore";

type Grouping = DiscoveryGrouping | StoryBoardGrouping;

const GROUPING_OPTIONS: { value: Grouping; label: string; Icon: typeof Layers }[] = [
  { value: "none", label: "No grouping", Icon: Columns3 },
  { value: "epic", label: "Group by epic", Icon: Layers },
];

/** The "No grouping" / "Group by epic" toggle of the Factory boards (FB-224, FB-291). */
export function GroupingToggle({
  value,
  onChange,
  className = "",
}: {
  value: Grouping;
  onChange: (g: Grouping) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="Grouping" className={`flex items-center rounded border border-gray-700 p-0.5 ${className}`}>
      {GROUPING_OPTIONS.map(({ value: option, label, Icon }) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`flex items-center gap-1.5 text-xs rounded px-2.5 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            value === option ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
