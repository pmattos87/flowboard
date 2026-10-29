import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { Link } from "react-router-dom";
import { useBackupStatus } from "@/hooks/useBackup";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_DAYS = 3;
/** How often the age is re-read, so the card appears while the app sits idle. */
const TICK_MS = 60 * 1000;

/**
 * Non-dismissible warning under the sidebar nav when the last backup is
 * missing or more than 3 days old. Always shown in staging, which never backs up.
 * Hidden until the first status fetch resolves, so it never flashes at launch.
 */
export function BackupWarning() {
  const { data: status } = useBackupStatus();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  if (!status) return null;

  const ageMs = status.last_backup_at
    ? now - new Date(status.last_backup_at).getTime()
    : null;
  const stale = ageMs === null || ageMs > STALE_AFTER_DAYS * DAY_MS;
  if (status.enabled && !stale) return null;
  const days = ageMs === null ? null : Math.floor(ageMs / DAY_MS);

  return (
    <Link
      to="/settings?tab=backup"
      data-testid="backup-warning"
      className="mx-2 mt-3 block space-y-1.5 rounded-md border border-red-900 bg-red-950/60 p-3 text-red-200 transition-colors hover:bg-red-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
    >
      <div className="flex items-center gap-2">
        <CloudOff className="h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
        <span className="text-sm font-bold uppercase tracking-wider">No backup</span>
      </div>
      {days !== null && <p className="text-sm font-semibold">{days} days ago</p>}
      <p className="text-xs text-red-300/80">
        {status.backup_dir
          ? "Check that the Google Drive folder exists and Drive is connected"
          : "Set the folder in Settings › Backup"}
      </p>
    </Link>
  );
}
