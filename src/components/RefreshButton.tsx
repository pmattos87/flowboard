import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/**
 * Re-syncs the UI with the database by invalidating every React Query cache.
 * The icon spins on click for at least one full rotation, and keeps spinning
 * while any query is still refetching. Placed next to each board's title in the
 * main content area.
 */
export function RefreshButton({ className }: { className?: string }) {
  const qc = useQueryClient();
  const isFetching = useIsFetching() > 0;
  const [spinning, setSpinning] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const handleRefresh = () => {
    qc.invalidateQueries();
    setSpinning(true);
    // Local SQLite refetches finish within a frame, so guarantee one full
    // rotation. 1000ms matches animate-spin's 1s linear period, ending the
    // turn cleanly at 0° with no mid-rotation snap-back.
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setSpinning(false), 1000);
  };

  return (
    <button
      type="button"
      aria-label="Refresh"
      title="Refresh data"
      onClick={handleRefresh}
      className={cn(
        "text-gray-400 hover:text-gray-200 transition-colors",
        className,
      )}
    >
      <RefreshCw
        className={cn("h-4 w-4", (spinning || isFetching) && "animate-spin")}
      />
    </button>
  );
}
