//! Backup triggers and commands (FB-95, after Hammer Loc D19). The engine lives
//! in `db::backup`; this file decides when it runs.
//!
//! Triggers: one snapshot at launch, then one 5 minutes after the last write,
//! each new write restarting the wait. Writes are seen through the `db::watch`
//! callback, so the CLI/MCP's writes count too; only the app ever backs up.
//! The staging build (`com.flowboard.staging`) never writes a copy, but its
//! commands still work so the Settings UI can be tested there.
//!
//! Nothing here returns an error to the launch path or blocks the watcher: a
//! failed snapshot is logged and kept as `last_error` for `get_backup_status`.

use crate::db::backup::{run_backup, BackupClock, BackupError, BackupSettings};
use serde::Serialize;
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;
use tauri::State;
use tokio::sync::Notify;
use tokio::time::Instant;

/// Quiet time after the last write before a snapshot runs.
pub const DEBOUNCE: Duration = Duration::from_secs(5 * 60);
/// The staging build's Tauri identifier: it never writes a backup.
pub const STAGING_IDENTIFIER: &str = "com.flowboard.staging";

/// Backups are written by every build except staging.
pub fn backups_enabled(identifier: &str) -> bool {
    identifier != STAGING_IDENTIFIER
}

/// Managed state shared by the scheduler and the commands.
pub struct Backups {
    settings_path: PathBuf,
    enabled: bool,
    /// Held by every writer of `backup.json`, so a snapshot's `last_backup_at`
    /// stamp never overwrites a folder chosen while it was running.
    writer: tokio::sync::Mutex<()>,
    /// The last snapshot's failure, cleared by the next success. In memory only.
    last_error: Mutex<Option<String>>,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct BackupStatus {
    pub backup_dir: Option<String>,
    pub last_backup_at: Option<String>,
    pub last_error: Option<String>,
    /// False in the staging build: no copy is ever written there.
    pub enabled: bool,
}

impl Backups {
    pub fn new(settings_path: PathBuf, enabled: bool) -> Self {
        Self {
            settings_path,
            enabled,
            writer: tokio::sync::Mutex::new(()),
            last_error: Mutex::new(None),
        }
    }

    /// One snapshot attempt. Never fails: an error is logged and recorded.
    /// With no folder set, backups are off, which is not an error.
    pub async fn snapshot(&self, pool: &SqlitePool) {
        if !self.enabled {
            return;
        }
        let _writer = self.writer.lock().await;
        let result = match BackupClock::now(pool).await {
            Ok(clock) => run_backup(pool, &self.settings_path, &clock).await.map(|_| ()),
            Err(e) => Err(BackupError::Failed(e)),
        };
        let error = match result {
            Ok(()) | Err(BackupError::NotConfigured) => None,
            Err(e) => {
                eprintln!("backup failed: {e}");
                Some(e.to_string())
            }
        };
        *self.last_error.lock().unwrap_or_else(PoisonError::into_inner) = error;
    }

    /// Reads `backup.json` without waiting for a running snapshot: the file is
    /// always replaced whole, so a read never sees it torn.
    pub fn status(&self) -> BackupStatus {
        let settings = BackupSettings::load(&self.settings_path);
        BackupStatus {
            backup_dir: settings
                .backup_dir
                .map(|d| d.to_string_lossy().into_owned()),
            last_backup_at: settings.last_backup_at,
            last_error: self
                .last_error
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .clone(),
            enabled: self.enabled,
        }
    }

    /// Stores `path` as the backup folder. It must be an existing folder: it
    /// is never created. Keeps `last_backup_at`, and drops `last_error`, which
    /// described the previous folder.
    pub async fn set_dir(&self, path: &str) -> Result<(), String> {
        let dir = Path::new(path);
        if !dir.exists() {
            return Err(format!("backup folder {path} was not found"));
        }
        if !dir.is_dir() {
            return Err(format!("{path} is not a folder"));
        }
        let _writer = self.writer.lock().await;
        let mut settings = BackupSettings::load(&self.settings_path);
        settings.backup_dir = Some(dir.to_path_buf());
        settings.save(&self.settings_path)?;
        *self.last_error.lock().unwrap_or_else(PoisonError::into_inner) = None;
        Ok(())
    }
}

/// When the next snapshot is due. Pure (time is passed in), so tests drive it
/// with made-up instants instead of waiting 5 minutes.
struct Debounce {
    window: Duration,
    due: Option<Instant>,
}

impl Debounce {
    fn new(window: Duration) -> Self {
        Self { window, due: None }
    }

    /// A write happened: the snapshot is due `window` after it.
    fn signal(&mut self, now: Instant) {
        self.due = Some(now + self.window);
    }

    /// True once when the window has passed with no newer write.
    fn take_due(&mut self, now: Instant) -> bool {
        match self.due {
            Some(due) if now >= due => {
                self.due = None;
                true
            }
            _ => false,
        }
    }
}

/// Snapshot once, then after each quiet `window` following a `signal`.
/// Runs forever. Snapshots run inline, so two never overlap; a write during
/// one leaves a permit in `signal` and starts the next window.
async fn schedule(backups: &Backups, pool: &SqlitePool, signal: &Notify, window: Duration) {
    backups.snapshot(pool).await;
    let mut debounce = Debounce::new(window);
    loop {
        match debounce.due {
            None => {
                signal.notified().await;
                debounce.signal(Instant::now());
            }
            Some(due) => tokio::select! {
                _ = signal.notified() => debounce.signal(Instant::now()),
                _ = tokio::time::sleep_until(due) => {
                    if debounce.take_due(Instant::now()) {
                        backups.snapshot(pool).await;
                    }
                }
            },
        }
    }
}

/// Starts the launch snapshot and the debounce off the caller's thread, and
/// returns the handle the `db::watch` callback notifies on each change.
/// `notify_one` never blocks, so the watcher loop is never held up.
pub fn start(backups: Arc<Backups>, pool: SqlitePool) -> Arc<Notify> {
    let signal = Arc::new(Notify::new());
    let rx = Arc::clone(&signal);
    tauri::async_runtime::spawn(async move {
        schedule(&backups, &pool, &rx, DEBOUNCE).await;
    });
    signal
}

#[tauri::command]
pub fn get_backup_status(backups: State<'_, Arc<Backups>>) -> Result<BackupStatus, String> {
    Ok(backups.status())
}

#[tauri::command]
pub async fn set_backup_dir(backups: State<'_, Arc<Backups>>, path: String) -> Result<(), String> {
    backups.set_dir(&path).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::backup::SETTINGS_FILE;
    use crate::db::open_and_migrate;
    use std::fs;

    struct Fixture {
        pool: SqlitePool,
        data: PathBuf,
        folder: PathBuf,
    }

    impl Fixture {
        fn settings(&self) -> PathBuf {
            self.data.join(SETTINGS_FILE)
        }

        /// A `Backups` with no folder set yet.
        fn backups(&self, enabled: bool) -> Backups {
            Backups::new(self.settings(), enabled)
        }

        fn set_folder(&self, dir: &Path) {
            BackupSettings {
                backup_dir: Some(dir.to_path_buf()),
                last_backup_at: None,
            }
            .save(&self.settings())
            .unwrap();
        }
    }

    /// A migrated live database in `appdata/` and an empty `backups/` folder.
    async fn fixture(tag: &str) -> Fixture {
        let root = std::env::temp_dir().join(format!(
            "flowboard-backup-cmd-test-{tag}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let data = root.join("appdata");
        let folder = root.join("backups");
        fs::create_dir_all(&data).unwrap();
        fs::create_dir_all(&folder).unwrap();
        let pool = open_and_migrate(&data.join("flowboard.db")).await.unwrap();
        Fixture { pool, data, folder }
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().into_string().unwrap())
            .collect();
        names.sort();
        names
    }

    /// The app keeps working on the pool after a backup attempt.
    async fn pool_still_works(pool: &SqlitePool) {
        sqlx::query("INSERT INTO people (name, email) VALUES ('p', 'p@x')")
            .execute(pool)
            .await
            .expect("the pool is unaffected by the backup");
    }

    #[test]
    fn n_writes_inside_the_window_give_one_snapshot_and_a_later_write_a_second() {
        let mut d = Debounce::new(DEBOUNCE);
        let t0 = Instant::now();
        let at = |secs: u64| t0 + Duration::from_secs(secs);
        let mut snapshots = 0;

        // Ten writes, each 4 minutes after the previous: every one restarts
        // the wait, so nothing is due during the 36 minutes they span.
        for i in 0..10 {
            let now = at(i * 240);
            snapshots += d.take_due(now) as u32;
            d.signal(now);
        }
        assert_eq!(snapshots, 0);
        let last = 9 * 240;

        // Due exactly 5 minutes after the last write, and only once.
        assert!(!d.take_due(at(last + 299)));
        assert!(d.take_due(at(last + 300)));
        snapshots += 1;
        assert!(!d.take_due(at(last + 301)));
        assert!(!d.take_due(at(last + 3600)), "no write since: nothing due");
        assert_eq!(snapshots, 1);

        // A write after that window gives a second snapshot.
        d.signal(at(last + 3600));
        assert!(!d.take_due(at(last + 3600 + 299)));
        assert!(d.take_due(at(last + 3600 + 300)));
        snapshots += 1;
        assert_eq!(snapshots, 2);
    }

    #[test]
    fn only_the_staging_identifier_turns_backups_off() {
        assert!(!backups_enabled("com.flowboard.staging"));
        assert!(backups_enabled("com.flowboard.app"));
    }

    #[tokio::test]
    async fn a_launch_with_no_folder_set_writes_nothing_and_reports_no_error() {
        let f = fixture("unset").await;
        let before = names(&f.data);
        let backups = f.backups(true);

        backups.snapshot(&f.pool).await;

        assert_eq!(names(&f.data), before, "no settings file or copy is created");
        assert!(names(&f.folder).is_empty());
        let status = backups.status();
        assert_eq!(status.backup_dir, None);
        assert_eq!(status.last_error, None, "backups off is not an error");
        assert!(status.enabled);
        pool_still_works(&f.pool).await;
    }

    #[tokio::test]
    async fn a_launch_with_an_unreachable_folder_records_the_error_and_the_pool_keeps_working() {
        let f = fixture("unreachable").await;
        let gone = f.folder.join("drive-unplugged");
        f.set_folder(&gone);
        let backups = f.backups(true);

        backups.snapshot(&f.pool).await;

        assert!(!gone.exists());
        let status = backups.status();
        assert_eq!(status.last_backup_at, None);
        let error = status.last_error.expect("the failure is kept for the UI");
        assert!(error.contains("was not found"), "{error}");
        pool_still_works(&f.pool).await;

        // The next success clears it.
        f.set_folder(&f.folder);
        backups.snapshot(&f.pool).await;
        assert_eq!(backups.status().last_error, None);
        assert_eq!(names(&f.folder).len(), 1);
    }

    #[tokio::test]
    async fn the_scheduler_snapshots_at_launch_and_after_a_quiet_window() {
        let f = fixture("schedule").await;
        f.set_folder(&f.folder);
        let backups = Arc::new(f.backups(true));
        let signal = Arc::new(Notify::new());
        let task = {
            let (backups, pool, signal) = (backups.clone(), f.pool.clone(), signal.clone());
            tokio::spawn(async move {
                schedule(&backups, &pool, &signal, Duration::from_millis(50)).await
            })
        };

        let stamped = || BackupSettings::load(&f.settings()).last_backup_at;
        wait_until(|| stamped().is_some()).await;
        let launch = stamped();
        assert_eq!(names(&f.folder).len(), 1, "the launch snapshot");

        // The stamp has millisecond resolution; make the next one differ.
        tokio::time::sleep(Duration::from_millis(5)).await;
        signal.notify_one();
        wait_until(|| stamped() != launch).await;
        task.abort();
    }

    /// The real loop: a burst of writes inside the window gives one snapshot,
    /// taken a full window after the last write (each write resets the wait),
    /// and a write after that gives exactly one more.
    #[tokio::test]
    async fn the_scheduler_turns_a_burst_of_writes_into_one_snapshot_after_the_last() {
        let f = fixture("schedule-burst").await;
        f.set_folder(&f.folder);
        let window = Duration::from_millis(400);
        let backups = Arc::new(f.backups(true));
        let signal = Arc::new(Notify::new());
        let task = {
            let (backups, pool, signal) = (backups.clone(), f.pool.clone(), signal.clone());
            tokio::spawn(async move { schedule(&backups, &pool, &signal, window).await })
        };
        let stamped = || BackupSettings::load(&f.settings()).last_backup_at;
        wait_until(|| stamped().is_some()).await;
        let launch = stamped();

        // Collects each distinct stamp seen while polling for `span`.
        let collect = |span: Duration| {
            let stamped = &stamped;
            async move {
                let mut seen: Vec<String> = Vec::new();
                let end = Instant::now() + span;
                while Instant::now() < end {
                    if let Some(s) = stamped() {
                        if seen.last() != Some(&s) {
                            seen.push(s);
                        }
                    }
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
                seen
            }
        };

        // Six writes 50ms apart (250ms in all, inside one window).
        for _ in 0..6 {
            signal.notify_one();
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        // 250ms after the last write: a timer that did not reset on each write
        // (due 400ms after the first) would have fired by now.
        let quiet = collect(Duration::from_millis(250)).await;
        assert_eq!(quiet, vec![launch.clone().unwrap()], "nothing before a full window");
        let after = collect(Duration::from_millis(1200)).await;
        let new: Vec<_> = after.iter().filter(|s| Some(*s) != launch.as_ref()).collect();
        assert_eq!(new.len(), 1, "exactly one snapshot for the burst: {after:?}");

        // One write after that window: exactly one more.
        let burst = new[0].clone();
        signal.notify_one();
        let later = collect(Duration::from_millis(1200)).await;
        let newer: Vec<_> = later
            .iter()
            .filter(|s| Some(*s) != launch.as_ref() && **s != burst)
            .collect();
        assert_eq!(newer.len(), 1, "a second snapshot for the later write: {later:?}");
        task.abort();
    }

    /// Polls `done` for up to 5 seconds without blocking the runtime.
    async fn wait_until(done: impl Fn() -> bool) {
        for _ in 0..200 {
            if done() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        panic!("timed out");
    }

    #[tokio::test]
    async fn staging_never_writes_a_copy_at_launch_or_after_writes() {
        let f = fixture("staging").await;
        f.set_folder(&f.folder);
        let backups = Arc::new(f.backups(backups_enabled(STAGING_IDENTIFIER)));
        let signal = Arc::new(Notify::new());
        let task = {
            let (backups, pool, signal) = (backups.clone(), f.pool.clone(), signal.clone());
            tokio::spawn(async move {
                schedule(&backups, &pool, &signal, Duration::from_millis(20)).await
            })
        };
        for _ in 0..3 {
            signal.notify_one();
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        task.abort();

        assert!(names(&f.folder).is_empty());
        let status = backups.status();
        assert!(!status.enabled);
        assert_eq!(status.last_backup_at, None);
        assert_eq!(status.last_error, None);
        assert_eq!(
            status.backup_dir.as_deref(),
            Some(f.folder.to_string_lossy().as_ref()),
            "the folder is still stored and reported"
        );
    }

    #[tokio::test]
    async fn set_backup_dir_rejects_a_missing_path_or_a_file_and_stores_a_folder() {
        let f = fixture("set-dir").await;
        for enabled in [true, false] {
            let _ = fs::remove_file(f.settings());
            let backups = f.backups(enabled);

            let missing = f.folder.join("nope");
            let err = backups.set_dir(&missing.to_string_lossy()).await.unwrap_err();
            assert!(err.contains("was not found"), "{err}");
            let file = f.data.join("flowboard.db");
            let err = backups.set_dir(&file.to_string_lossy()).await.unwrap_err();
            assert!(err.contains("is not a folder"), "{err}");
            assert!(backups.set_dir("").await.is_err());
            assert_eq!(backups.status().backup_dir, None, "nothing stored");
            assert!(!f.settings().exists());

            let dir = f.folder.to_string_lossy().into_owned();
            backups.set_dir(&dir).await.unwrap();
            let status = backups.status();
            assert_eq!(status.backup_dir.as_deref(), Some(dir.as_str()));
            assert_eq!(status.enabled, enabled);
            assert!(names(&f.folder).is_empty(), "setting a folder writes no copy");
        }
    }

    #[tokio::test]
    async fn set_backup_dir_keeps_last_backup_at() {
        let f = fixture("set-dir-keeps").await;
        BackupSettings {
            backup_dir: None,
            last_backup_at: Some("2026-10-01T12:00:00.000Z".into()),
        }
        .save(&f.settings())
        .unwrap();
        let backups = f.backups(true);
        backups.set_dir(&f.folder.to_string_lossy()).await.unwrap();
        assert_eq!(
            backups.status().last_backup_at.as_deref(),
            Some("2026-10-01T12:00:00.000Z")
        );
    }
}
