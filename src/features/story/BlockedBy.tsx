import type { SyntheticEvent } from "react";
import { Link } from "react-router-dom";
import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";

// "Blocked by FB-x" on a Story card (FB-99): the Story's open depends-on links.
// The card is a draggable that opens its Story on click, so each key stops its
// pointer and click events from reaching it: a key navigates, nothing else.

const stop = (e: SyntheticEvent) => e.stopPropagation();

export function BlockedBy({ keys, className }: { keys: string[]; className?: string }) {
  if (keys.length === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1 text-[11px] text-red-400", className)}>
      <Ban className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>Blocked by</span>
      {keys.map((k, i) => (
        <span key={k}>
          <Link
            to={`/story/${k}`}
            onPointerDown={stop}
            onClick={stop}
            className="font-mono text-red-300 hover:text-red-200 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded-sm"
          >
            {k}
          </Link>
          {i < keys.length - 1 && ","}
        </span>
      ))}
    </span>
  );
}
