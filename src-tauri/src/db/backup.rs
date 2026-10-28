//! Automatic backup engine (FB-95, after Hammer Loc D19): the app snapshots its
//! own database into a user-chosen folder.
//!
//! One run: `VACUUM INTO` `flowboard-YYYY-MM-DD.db.part`, `PRAGMA quick_check`
//! it, rename it over the day's `flowboard-YYYY-MM-DD.db`, prune that folder to
//! the newest `KEEP` dated files, and only then stamp `last_backup_at`. A copy
//! that fails verification is deleted and the stamp does not move, so a failed
//! backup always looks like no backup.
//!
//! Settings live in `backup.json` in the app data dir (no migration). With no
//! `backup_dir` set, backups are off. Triggers and commands are wired elsewhere.

use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{ConnectOptions, Connection, SqlitePool};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;

/// File name of the backup settings, inside the app data dir.
pub const SETTINGS_FILE: &str = "backup.json";
/// Dated snapshots kept per folder, counted by file and not by date.
pub const KEEP: usize = 10;
const PREFIX: &str = "flowboard-";
const SUFFIX: &str = ".db";

/// What `backup.json` holds. A missing or unreadable file reads as the default:
/// no folder, never backed up.
#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct BackupSettings {
    pub backup_dir: Option<PathBuf>,
    /// UTC ISO-8601, the same format as the database timestamps.
    pub last_backup_at: Option<String>,
}

impl BackupSettings {
    pub fn load(path: &Path) -> Self {
        fs::read(path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    /// Written through a `.part` and a rename, so a crash mid-write never
    /// leaves a torn file that would read as "no folder".
    pub fn save(&self, path: &Path) -> Result<(), String> {
        let json = serde_json::to_vec_pretty(self).map_err(|e| e.to_string())?;
        let mut part = path.as_os_str().to_os_string();
        part.push(".part");
        fs::write(&part, json).map_err(|e| format!("failed to write backup settings: {e}"))?;
        fs::rename(&part, path).map_err(|e| {
            let _ = fs::remove_file(&part);
            format!("failed to write backup settings: {e}")
        })
    }
}

/// The moment of a backup, injected so tests can pin the day.
#[derive(Debug, Clone)]
pub struct BackupClock {
    /// Local `YYYY-MM-DD`: names the day's file.
    pub day: String,
    /// UTC ISO-8601: becomes `last_backup_at`.
    pub at: String,
}

impl BackupClock {
    /// The current moment, read from SQLite (no date crate in the tree).
    pub async fn now(pool: &SqlitePool) -> Result<Self, String> {
        let (day, at): (String, String) = sqlx::query_as(
            "SELECT date('now','localtime'), strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        )
        .fetch_one(pool)
        .await
        .map_err(|e| format!("failed to read the clock: {e}"))?;
        Ok(Self { day, at })
    }
}

#[derive(Debug, PartialEq)]
pub enum BackupError {
    /// No `backup_dir` set: backups are off. Nothing was written.
    NotConfigured,
    /// `backup_dir` is set but not a folder on disk (e.g. a changed drive
    /// letter). It is never created. Nothing was written.
    FolderMissing(PathBuf),
    /// The copy failed `quick_check` and was deleted.
    VerifyFailed,
    /// Writing the copy or the settings failed.
    Failed(String),
}

impl fmt::Display for BackupError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotConfigured => write!(f, "no backup folder is set"),
            Self::FolderMissing(dir) => write!(f, "backup folder {} was not found", dir.display()),
            Self::VerifyFailed => write!(f, "the backup copy failed verification and was discarded"),
            Self::Failed(msg) => write!(f, "{msg}"),
        }
    }
}

/// Take today's snapshot into the folder named in `settings_path`. Returns the
/// path of the verified copy.
pub async fn run_backup(
    pool: &SqlitePool,
    settings_path: &Path,
    clock: &BackupClock,
) -> Result<PathBuf, BackupError> {
    run_with(pool, settings_path, clock, |_| {}).await
}

/// `tamper` runs between the `VACUUM INTO` and the verification; only tests
/// pass anything but a no-op, to force the failed-verification path.
async fn run_with(
    pool: &SqlitePool,
    settings_path: &Path,
    clock: &BackupClock,
    tamper: impl FnOnce(&Path),
) -> Result<PathBuf, BackupError> {
    let mut settings = BackupSettings::load(settings_path);
    let dir = settings
        .backup_dir
        .clone()
        .filter(|d| !d.as_os_str().is_empty())
        .ok_or(BackupError::NotConfigured)?;
    if !dir.is_dir() {
        return Err(BackupError::FolderMissing(dir));
    }

    let target = dir.join(format!("{PREFIX}{}{SUFFIX}", clock.day));
    let part = dir.join(format!("{PREFIX}{}{SUFFIX}.part", clock.day));

    // `VACUUM INTO` refuses an existing destination.
    let _ = fs::remove_file(&part);
    sqlx::query("VACUUM INTO ?")
        .bind(part.to_string_lossy().into_owned())
        .execute(pool)
        .await
        .map_err(|e| {
            let _ = fs::remove_file(&part);
            BackupError::Failed(format!("failed to write the backup copy: {e}"))
        })?;

    tamper(&part);
    if !verify(&part).await {
        let _ = fs::remove_file(&part);
        return Err(BackupError::VerifyFailed);
    }
    // Same folder, so the rename is atomic and replaces the day's earlier copy.
    fs::rename(&part, &target).map_err(|e| {
        let _ = fs::remove_file(&part);
        BackupError::Failed(format!("failed to move the backup copy into place: {e}"))
    })?;
    prune(&dir);

    settings.last_backup_at = Some(clock.at.clone());
    settings.save(settings_path).map_err(BackupError::Failed)?;
    Ok(target)
}

/// `PRAGMA quick_check` on a plain connection (mode `rw`, no journal_mode, no
/// migrations: LESSONS SF-2), closed before the caller renames the file.
async fn verify(path: &Path) -> bool {
    let Ok(options) = SqliteConnectOptions::from_str(&super::sqlite_url(path, "rw")) else {
        return false;
    };
    let Ok(mut conn) = options.connect().await else {
        return false;
    };
    let rows = sqlx::query_scalar::<_, String>("PRAGMA quick_check")
        .fetch_all(&mut conn)
        .await;
    let closed = conn.close().await.is_ok();
    closed && matches!(rows, Ok(r) if r == ["ok"])
}

/// True only for `flowboard-YYYY-MM-DD.db`, exactly.
fn is_snapshot_name(name: &str) -> bool {
    let Some(date) = name
        .strip_prefix(PREFIX)
        .and_then(|rest| rest.strip_suffix(SUFFIX))
    else {
        return false;
    };
    date.len() == 10
        && date.bytes().enumerate().all(|(i, b)| match i {
            4 | 7 => b == b'-',
            _ => b.is_ascii_digit(),
        })
}

/// Keep the `KEEP` newest dated snapshots in `dir`, by name (the date sorts).
/// Only regular files whose name matches exactly are candidates; nothing else
/// in the folder is touched and subfolders are never entered.
fn prune(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut dated: Vec<String> = entries
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|name| is_snapshot_name(name))
        .collect();
    dated.sort_unstable_by(|a, b| b.cmp(a));
    for old in dated.iter().skip(KEEP) {
        let _ = fs::remove_file(dir.join(old));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture {
        pool: SqlitePool,
        settings: PathBuf,
        backups: PathBuf,
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "flowboard-backup-test-{tag}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A migrated live database with one project, and a backup folder set.
    async fn fixture(tag: &str) -> Fixture {
        let root = temp_dir(tag);
        let data = root.join("appdata");
        fs::create_dir_all(&data).unwrap();
        let pool = super::super::open_and_migrate(&data.join("flowboard.db"))
            .await
            .unwrap();
        add_project(&pool, "AAA").await;
        let backups = root.join("backups");
        fs::create_dir_all(&backups).unwrap();
        let settings = data.join(SETTINGS_FILE);
        BackupSettings {
            backup_dir: Some(backups.clone()),
            last_backup_at: None,
        }
        .save(&settings)
        .unwrap();
        Fixture {
            pool,
            settings,
            backups,
        }
    }

    async fn add_project(pool: &SqlitePool, key: &str) {
        sqlx::query("INSERT INTO projects (name, key, created_at) VALUES (?, ?, '2026-01-01')")
            .bind(key)
            .bind(key)
            .execute(pool)
            .await
            .unwrap();
    }

    fn clock(day: &str) -> BackupClock {
        BackupClock {
            day: day.into(),
            at: format!("{day}T12:00:00.000Z"),
        }
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

    /// Opens the copy as its own database: its quick_check and project keys.
    async fn inspect(path: &Path) -> (String, Vec<String>) {
        let mut conn = SqliteConnectOptions::from_str(&super::super::sqlite_url(path, "ro"))
            .unwrap()
            .connect()
            .await
            .expect("the copy opens as a database");
        let check: String = sqlx::query_scalar("PRAGMA quick_check")
            .fetch_one(&mut conn)
            .await
            .unwrap();
        let keys: Vec<String> = sqlx::query_scalar("SELECT key FROM projects ORDER BY id")
            .fetch_all(&mut conn)
            .await
            .unwrap();
        conn.close().await.unwrap();
        (check, keys)
    }

    #[tokio::test]
    async fn a_snapshot_writes_a_verified_copy_and_stamps_last_backup_at() {
        let f = fixture("ok").await;

        let path = run_backup(&f.pool, &f.settings, &clock("2026-10-28"))
            .await
            .expect("the backup runs");

        assert_eq!(path, f.backups.join("flowboard-2026-10-28.db"));
        assert_eq!(
            names(&f.backups),
            ["flowboard-2026-10-28.db"],
            "no .part, -wal or -shm left behind"
        );
        assert_eq!(inspect(&path).await, ("ok".to_string(), vec!["AAA".to_string()]));
        assert_eq!(
            BackupSettings::load(&f.settings).last_backup_at.as_deref(),
            Some("2026-10-28T12:00:00.000Z")
        );
    }

    #[tokio::test]
    async fn a_second_snapshot_the_same_day_replaces_that_days_file() {
        let f = fixture("same-day").await;
        run_backup(&f.pool, &f.settings, &clock("2026-10-28")).await.unwrap();
        add_project(&f.pool, "BBB").await;
        let later = BackupClock {
            day: "2026-10-28".into(),
            at: "2026-10-28T18:00:00.000Z".into(),
        };
        run_backup(&f.pool, &f.settings, &later).await.unwrap();

        assert_eq!(names(&f.backups), ["flowboard-2026-10-28.db"]);
        let (_, keys) = inspect(&f.backups.join("flowboard-2026-10-28.db")).await;
        assert_eq!(keys, ["AAA", "BBB"], "the later copy replaced the earlier one");
        assert_eq!(
            BackupSettings::load(&f.settings).last_backup_at.as_deref(),
            Some("2026-10-28T18:00:00.000Z")
        );
    }

    #[tokio::test]
    async fn a_new_day_adds_a_file_and_the_folder_stays_ten_deep() {
        let f = fixture("rotate").await;
        for d in 1..=10 {
            fs::write(f.backups.join(format!("flowboard-2026-10-{d:02}.db")), b"old").unwrap();
        }
        run_backup(&f.pool, &f.settings, &clock("2026-10-28")).await.unwrap();

        let left = names(&f.backups);
        assert_eq!(left.len(), KEEP);
        assert!(!left.contains(&"flowboard-2026-10-01.db".to_string()));
        assert!(left.contains(&"flowboard-2026-10-28.db".to_string()));
    }

    #[tokio::test]
    async fn a_copy_that_fails_verification_is_deleted_and_not_stamped() {
        let f = fixture("corrupt").await;
        let corrupt = |part: &Path| fs::write(part, b"this is not a sqlite database").unwrap();

        // Never backed up: the stamp stays unset.
        let err = run_with(&f.pool, &f.settings, &clock("2026-10-28"), corrupt)
            .await
            .unwrap_err();
        assert_eq!(err, BackupError::VerifyFailed);
        assert!(names(&f.backups).is_empty(), "the bad copy is deleted");
        assert_eq!(BackupSettings::load(&f.settings).last_backup_at, None);

        // Backed up before: the stamp keeps its old value, and the day's
        // earlier verified copy is left as it was.
        run_backup(&f.pool, &f.settings, &clock("2026-10-28")).await.unwrap();
        let before = fs::read(f.backups.join("flowboard-2026-10-28.db")).unwrap();
        let later = BackupClock {
            day: "2026-10-28".into(),
            at: "2026-10-28T18:00:00.000Z".into(),
        };
        let err = run_with(&f.pool, &f.settings, &later, corrupt).await.unwrap_err();
        assert_eq!(err, BackupError::VerifyFailed);
        assert_eq!(names(&f.backups), ["flowboard-2026-10-28.db"]);
        assert_eq!(fs::read(f.backups.join("flowboard-2026-10-28.db")).unwrap(), before);
        assert_eq!(
            BackupSettings::load(&f.settings).last_backup_at.as_deref(),
            Some("2026-10-28T12:00:00.000Z")
        );
    }

    #[tokio::test]
    async fn an_unset_backup_dir_writes_nothing() {
        let f = fixture("unset").await;
        let data = f.settings.parent().unwrap().to_path_buf();
        let before = names(&data);

        // No settings file at all, then a file with an empty folder.
        fs::remove_file(&f.settings).unwrap();
        let err = run_backup(&f.pool, &f.settings, &clock("2026-10-28")).await.unwrap_err();
        assert_eq!(err, BackupError::NotConfigured);
        assert!(!f.settings.exists(), "the settings file is not created");

        BackupSettings {
            backup_dir: Some(PathBuf::new()),
            last_backup_at: None,
        }
        .save(&f.settings)
        .unwrap();
        let err = run_backup(&f.pool, &f.settings, &clock("2026-10-28")).await.unwrap_err();
        assert_eq!(err, BackupError::NotConfigured);

        assert!(names(&f.backups).is_empty());
        assert_eq!(names(&data), before);
        assert_eq!(BackupSettings::load(&f.settings).last_backup_at, None);
    }

    #[tokio::test]
    async fn a_missing_backup_folder_writes_nothing_and_is_not_created() {
        let f = fixture("missing").await;
        let gone = f.backups.join("drive-letter-changed");
        BackupSettings {
            backup_dir: Some(gone.clone()),
            last_backup_at: Some("2026-10-01T12:00:00.000Z".into()),
        }
        .save(&f.settings)
        .unwrap();

        let err = run_backup(&f.pool, &f.settings, &clock("2026-10-28")).await.unwrap_err();
        assert_eq!(err, BackupError::FolderMissing(gone.clone()));
        assert!(!gone.exists());
        assert!(names(&f.backups).is_empty());
        assert_eq!(
            BackupSettings::load(&f.settings).last_backup_at.as_deref(),
            Some("2026-10-01T12:00:00.000Z")
        );
    }

    #[test]
    fn pruning_keeps_the_ten_newest_dated_files_and_touches_nothing_else() {
        let dir = temp_dir("prune");
        for d in 1..=12 {
            fs::write(dir.join(format!("flowboard-2020-01-{d:02}.db")), b"x").unwrap();
        }
        let unrelated = [
            "notes.txt",
            "flowboard-x.db",
            "flowboard-2019-12-31.db.bak",
            "flowboard-2019-12-31.db.part",
            "flowboard.db",
            "Flowboard-2019-12-31.db",
        ];
        for name in unrelated {
            fs::write(dir.join(name), b"keep").unwrap();
        }
        let sub = dir.join("flowboard-2019-01-01.db");
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join("flowboard-2000-01-01.db"), b"keep").unwrap();

        prune(&dir);

        let mut expected: Vec<String> =
            (3..=12).map(|d| format!("flowboard-2020-01-{d:02}.db")).collect();
        expected.extend(unrelated.iter().map(|s| s.to_string()));
        expected.push("flowboard-2019-01-01.db".to_string());
        expected.sort();
        assert_eq!(names(&dir), expected);
        assert_eq!(names(&sub), ["flowboard-2000-01-01.db"], "never recurses");
    }

    #[test]
    fn only_the_exact_dated_name_is_a_snapshot() {
        assert!(is_snapshot_name("flowboard-2026-10-28.db"));
        for name in [
            "flowboard-2026-10-28.db.part",
            "flowboard-2026-10-28.db-wal",
            "flowboard-2026-1-28.db",
            "flowboard-2026_10_28.db",
            "Flowboard-2026-10-28.db",
            "flowboard-2026-10-28.DB",
            "flowboard-x.db",
            "flowboard.db",
            "flowboard-abcd-10-28.db",
            "xflowboard-2026-10-28.db",
            "flowboard-testes-2026-10-28.db",
        ] {
            assert!(!is_snapshot_name(name), "{name}");
        }
    }

    #[test]
    fn settings_round_trip_and_a_bad_file_reads_as_never_backed_up() {
        let dir = temp_dir("settings");
        let path = dir.join(SETTINGS_FILE);

        assert_eq!(BackupSettings::load(&path), BackupSettings::default(), "missing file");

        let saved = BackupSettings {
            backup_dir: Some(PathBuf::from(r"G:\My Drive\Flowboard backups")),
            last_backup_at: Some("2026-10-28T12:00:00.000Z".into()),
        };
        saved.save(&path).unwrap();
        assert_eq!(BackupSettings::load(&path), saved);
        assert_eq!(names(&dir), [SETTINGS_FILE], "no .part left behind");

        fs::write(&path, b"{ not json").unwrap();
        assert_eq!(BackupSettings::load(&path), BackupSettings::default(), "unreadable file");

        // A directory where the file should be cannot be read either.
        let as_dir = dir.join("as-dir.json");
        fs::create_dir_all(&as_dir).unwrap();
        assert_eq!(BackupSettings::load(&as_dir), BackupSettings::default());

        fs::write(&path, b"{}").unwrap();
        assert_eq!(BackupSettings::load(&path), BackupSettings::default(), "empty object");
    }

    /// QA: a synced folder like `G:\My Drive\...` has spaces, and a user's
    /// folder may hold non-ASCII or `#`; the copy must still verify there.
    #[tokio::test]
    async fn a_folder_with_spaces_and_accents_still_gets_a_verified_copy() {
        let f = fixture("spaces").await;
        let odd = f.backups.join("My Drive #1").join("Cópias de segurança");
        fs::create_dir_all(&odd).unwrap();
        BackupSettings {
            backup_dir: Some(odd.clone()),
            last_backup_at: None,
        }
        .save(&f.settings)
        .unwrap();

        let path = run_backup(&f.pool, &f.settings, &clock("2026-10-28"))
            .await
            .expect("the backup runs");

        assert_eq!(names(&odd), ["flowboard-2026-10-28.db"]);
        assert_eq!(inspect(&path).await, ("ok".to_string(), vec!["AAA".to_string()]));
        assert!(BackupSettings::load(&f.settings).last_backup_at.is_some());
    }

    /// QA: pruning is by count, so a same-day rewrite on a full folder must
    /// not delete an older day to make room.
    #[tokio::test]
    async fn a_same_day_rewrite_on_a_full_folder_deletes_nothing() {
        let f = fixture("full-same-day").await;
        for d in 1..=9 {
            fs::write(f.backups.join(format!("flowboard-2026-10-{d:02}.db")), b"old").unwrap();
        }
        run_backup(&f.pool, &f.settings, &clock("2026-10-28")).await.unwrap();
        let first = names(&f.backups);
        assert_eq!(first.len(), KEEP);
        run_backup(&f.pool, &f.settings, &clock("2026-10-28")).await.unwrap();
        assert_eq!(names(&f.backups), first);
    }

    #[tokio::test]
    async fn the_clock_reads_a_local_day_and_a_utc_stamp() {
        let f = fixture("clock").await;
        let now = BackupClock::now(&f.pool).await.unwrap();
        assert_eq!(now.day.len(), "YYYY-MM-DD".len());
        assert!(is_snapshot_name(&format!("flowboard-{}.db", now.day)));
        assert_eq!(now.at.len(), "YYYY-MM-DDTHH:MM:SS.SSSZ".len(), "{}", now.at);
        assert!(now.at.ends_with('Z'), "{}", now.at);
    }
}
