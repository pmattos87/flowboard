import { open as openFolderPicker } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/Skeleton";
import { useBackupStatus, useSetBackupDir } from "@/hooks/useBackup";

/** Last backup time in the user's local time, e.g. "Oct 28, 2026, 3:04 PM". */
export function formatBackupTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function BackupSettings() {
  const { data: status, isLoading } = useBackupStatus();
  const setBackupDir = useSetBackupDir();

  const handleChooseFolder = async () => {
    const picked = await openFolderPicker({
      directory: true,
      multiple: false,
      title: "Choose a backup folder",
    });
    if (typeof picked !== "string") return; // cancelled
    setBackupDir.mutate(picked);
  };

  if (isLoading || !status) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        FlowBoard copies its database to this folder when it starts and five
        minutes after your last change. One copy is kept per day, up to ten.
      </p>

      {!status.enabled && (
        <p className="text-sm text-amber-400">Backups are off in this build.</p>
      )}

      <div className="space-y-1.5">
        <h2 className="text-sm font-medium text-gray-300">Backup folder</h2>
        <p className="text-sm text-gray-100 break-all">
          {status.backup_dir ?? (
            <span className="text-gray-500">
              No folder chosen. Backups are off until you choose one.
            </span>
          )}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleChooseFolder}
          disabled={setBackupDir.isPending}
          className="mt-2 bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Choose folder
        </Button>
      </div>

      <div className="space-y-1.5">
        <h2 className="text-sm font-medium text-gray-300">Last backup</h2>
        <p className="text-sm text-gray-100">
          {status.last_backup_at
            ? formatBackupTime(status.last_backup_at)
            : "Never"}
        </p>
      </div>

      {status.last_error && (
        <div className="space-y-1.5">
          <h2 className="text-sm font-medium text-gray-300">Last error</h2>
          <p className="text-sm text-red-400 break-words" role="alert">
            {status.last_error}
          </p>
        </div>
      )}
    </div>
  );
}
