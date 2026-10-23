import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { onDbChanged } from "@/lib/events";

/** Refetches everything when the database changes outside the app (CLI/MCP). */
export function useDbChangeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    onDbChanged(() => {
      void queryClient.invalidateQueries();
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [queryClient]);
}
