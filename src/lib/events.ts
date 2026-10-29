import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Emitted by the Rust backend when another connection commits to the app database. */
export const DB_CHANGED_EVENT = "db-changed";

export async function onDbChanged(cb: () => void): Promise<UnlistenFn> {
  return listen(DB_CHANGED_EVENT, () => cb());
}

/** Emitted by the Rust backend after each backup snapshot attempt, success or failure. */
export const BACKUP_FINISHED_EVENT = "backup-finished";

export async function onBackupFinished(cb: () => void): Promise<UnlistenFn> {
  return listen(BACKUP_FINISHED_EVENT, () => cb());
}
