import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getBackupStatus, setBackupDir } from "@/lib/commands";

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
