import { RefreshCw } from "lucide-react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/**
 * Re-syncs the UI with the database by invalidating every React Query cache.
 * The icon spins while any query is refetching. Placed next to each board's
 * title in the main content area.
 */
export function RefreshButton({ className }: { className?: string }) {
  const qc = useQueryClient();
  const isFetching = useIsFetching() > 0;

  return (
    <button
      type="button"
      aria-label="Refresh"
      title="Refresh data"
      onClick={() => qc.invalidateQueries()}
      className={cn(
        "text-gray-400 hover:text-gray-200 transition-colors",
        className,
      )}
    >
      <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
    </button>
  );
}
