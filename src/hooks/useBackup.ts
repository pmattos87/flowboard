import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getBackupStatus, setBackupDir } from "@/lib/commands";
import { onBackupFinished } from "@/lib/events";

export const backupKeys = {
  all: ["backup"] as const,
  status: () => [...backupKeys.all, "status"] as const,
};

export function useBackupStatus() {
  return useQuery({
    queryKey: backupKeys.status(),
    queryFn: getBackupStatus,
  });
}

export function useSetBackupDir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => setBackupDir(path),
    onSuccess: () => { qc.invalidateQueries({ queryKey: backupKeys.all }); },
    onError: (err) => toast.error(`Failed to set the backup folder: ${String(err)}`),
  });
}

/** Refetches the backup status after each snapshot attempt; a snapshot never fires db-changed. */
export function useBackupFinishedSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    onBackupFinished(() => {
      void queryClient.invalidateQueries({ queryKey: backupKeys.all });
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
