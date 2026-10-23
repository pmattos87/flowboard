use sqlx::migrate::Migrator;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::{ConnectOptions, Connection, SqliteConnection, SqlitePool};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub mod watch;

pub static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

/// Open (and create on first run) the SQLite pool at `<appDataDir>/flowboard.db`,
/// applying all pending migrations first.
pub async fn init_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let app_data_dir = app_data_dir(app)?;
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("failed to create app data dir: {e}"))?;

    open_and_migrate(&app_data_dir.join("flowboard.db")).await
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))
}

/// Path of the app database; the file exists once `init_pool` has run.
pub fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("flowboard.db"))
}

fn sqlite_url(path: &Path, mode: &str) -> String {
    format!(
        "sqlite://{}?mode={mode}",
        path.to_string_lossy().replace('\\', "/")
    )
}

/// Back up, migrate, then open the runtime pool for the database at `path`.
///
/// `PRAGMA foreign_keys = ON` is set on every runtime connection so CASCADE
/// DELETE works. Migrations, however, run on a dedicated connection with foreign
/// keys OFF: sqlx-sqlite always wraps a migration in a transaction, and
/// `PRAGMA foreign_keys` is a no-op inside a transaction. A migration that
/// rebuilds a table (e.g. to change a CHECK constraint) drops the old table,
/// which — with FK enforcement on — fires the ON DELETE actions of every child
/// reference (orphaning `parent_id` and cascade-deleting comments, time logs,
/// etc.). FK enforcement must be disabled at connect time, before the migration
/// transaction begins; the in-SQL `PRAGMA foreign_keys = OFF` cannot do this.
///
/// Runtime connections use WAL so the Flowboard CLI can write while the app is
/// open; sqlx's default 5s busy timeout covers the brief write locks.
pub async fn open_and_migrate(path: &Path) -> Result<SqlitePool, String> {
    let url = sqlite_url(path, "rwc");

    let mut migrate_conn = SqliteConnectOptions::from_str(&url)
        .map_err(|e| e.to_string())?
        .foreign_keys(false)
        .connect()
        .await
        .map_err(|e| format!("failed to open migration connection: {e}"))?;
    backup_before_migrations(&mut migrate_conn, path).await?;
    MIGRATOR
        .run(&mut migrate_conn)
        .await
        .map_err(|e| format!("failed to apply sqlx migrations: {e}"))?;
    migrate_conn
        .close()
        .await
        .map_err(|e| format!("failed to close migration connection: {e}"))?;

    let options = SqliteConnectOptions::from_str(&url)
        .map_err(|e| e.to_string())?
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal);

    SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|e| format!("failed to open sqlite pool: {e}"))
}

/// Versions of the migrations successfully applied to this database. Empty for
/// a brand-new database.
async fn applied_versions(conn: &mut SqliteConnection) -> Result<Vec<i64>, String> {
    let has_table: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
    )
    .fetch_one(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;
    if has_table == 0 {
        return Ok(vec![]);
    }
    sqlx::query_scalar("SELECT version FROM _sqlx_migrations WHERE success = 1 ORDER BY version")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())
}

/// When an existing database has pending migrations, write a consistent copy
/// next to it (`flowboard.db.pre-migration-<unix secs>.bak`) before touching it.
/// `VACUUM INTO` includes anything still in the WAL, unlike a plain file copy.
async fn backup_before_migrations(
    conn: &mut SqliteConnection,
    path: &Path,
) -> Result<Option<PathBuf>, String> {
    let applied = applied_versions(conn).await?;
    if applied.is_empty() {
        return Ok(None);
    }
    let pending = MIGRATOR.iter().any(|m| !applied.contains(&m.version));
    if !pending {
        return Ok(None);
    }
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".pre-migration-{secs}.bak"));
    let backup = path.with_file_name(name);
    sqlx::query("VACUUM INTO ?")
        .bind(backup.to_string_lossy().to_string())
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("failed to back up database before migrating: {e}"))?;
    Ok(Some(backup))
}

/// Open an existing database for the Flowboard CLI without migrating it.
///
/// The CLI and the app ship the same migration set. If they differ, sqlx in the
/// older of the two would refuse the database, so the CLI refuses first and says
/// which side to update.
pub async fn open_existing(path: &Path) -> Result<SqlitePool, String> {
    if !path.exists() {
        return Err(format!(
            "no Flowboard database at {} (open the app once to create it)",
            path.display()
        ));
    }
    let url = sqlite_url(path, "rw");
    // Check versions on a plain connection first: a refused database must be
    // left exactly as it was, journal mode included.
    let mut probe = SqliteConnectOptions::from_str(&url)
        .map_err(|e| e.to_string())?
        .connect()
        .await
        .map_err(|e| format!("failed to open {}: {e}", path.display()))?;
    let applied = applied_versions(&mut probe).await?;
    probe.close().await.map_err(|e| e.to_string())?;
    let known: Vec<i64> = MIGRATOR.iter().map(|m| m.version).collect();
    if applied.iter().any(|v| !known.contains(v)) {
        return Err(
            "the database was migrated by a newer Flowboard app; rebuild flowboard-cli from the same version"
                .into(),
        );
    }
    if known.iter().any(|v| !applied.contains(v)) {
        return Err(
            "the database is behind this flowboard-cli; open the updated Flowboard app once to migrate it"
                .into(),
        );
    }
    let options = SqliteConnectOptions::from_str(&url)
        .map_err(|e| e.to_string())?
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5));
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|e| format!("failed to open {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "flowboard-db-test-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("flowboard.db")
    }

    /// Apply only the migrations below `version` to a fresh file, as an older
    /// app would have.
    async fn migrate_up_to(path: &Path, version: i64) {
        let mut conn = SqliteConnectOptions::from_str(&sqlite_url(path, "rwc"))
            .unwrap()
            .foreign_keys(false)
            .connect()
            .await
            .unwrap();
        let older = Migrator {
            migrations: MIGRATOR
                .iter()
                .filter(|m| m.version < version)
                .cloned()
                .collect::<Vec<_>>()
                .into(),
            ..Migrator::DEFAULT
        };
        older.run(&mut conn).await.unwrap();
        conn.close().await.unwrap();
    }

    fn backups_in(path: &Path) -> usize {
        std::fs::read_dir(path.parent().unwrap())
            .unwrap()
            .filter(|e| {
                e.as_ref()
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .contains(".pre-migration-")
            })
            .count()
    }

    #[tokio::test]
    async fn backs_up_only_when_an_existing_db_has_pending_migrations() {
        let path = temp_db("backup");
        migrate_up_to(&path, 10).await;

        open_and_migrate(&path).await.unwrap().close().await;
        assert_eq!(backups_in(&path), 1, "pending migration 010 must trigger a backup");

        open_and_migrate(&path).await.unwrap().close().await;
        assert_eq!(backups_in(&path), 1, "an up-to-date database must not be backed up again");
    }

    #[tokio::test]
    async fn fresh_database_is_not_backed_up() {
        let path = temp_db("fresh");
        open_and_migrate(&path).await.unwrap().close().await;
        assert_eq!(backups_in(&path), 0);
    }

    #[tokio::test]
    async fn open_existing_refuses_a_database_behind_the_cli() {
        let path = temp_db("behind");
        migrate_up_to(&path, 10).await;
        let err = open_existing(&path).await.unwrap_err();
        assert!(err.contains("open the updated Flowboard app"), "{err}");

        let mut conn = SqliteConnectOptions::from_str(&sqlite_url(&path, "ro"))
            .unwrap()
            .connect()
            .await
            .unwrap();
        let mode: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(&mut conn)
            .await
            .unwrap();
        assert_eq!(mode, "delete", "a refused database must not be switched to WAL");
    }

    /// Every row of every pre-existing table, original columns only, as SQL
    /// literals (`quote()` keeps BLOBs as hex) ordered by rowid.
    async fn snapshot(
        conn: &mut SqliteConnection,
        columns: &[(String, Vec<String>)],
    ) -> Vec<(String, Vec<String>)> {
        let mut out = vec![];
        for (table, cols) in columns {
            let list = cols
                .iter()
                .map(|c| format!("quote(\"{c}\")"))
                .collect::<Vec<_>>()
                .join(" || '|' || ");
            let rows: Vec<String> = sqlx::query_scalar(&format!(
                "SELECT {list} FROM \"{table}\" ORDER BY rowid"
            ))
            .fetch_all(&mut *conn)
            .await
            .unwrap();
            out.push((table.clone(), rows));
        }
        out
    }

    /// Run with `FLOWBOARD_MIGRATION_SOURCE=<path to a real flowboard.db>
    /// cargo test --lib real_database_survives_migration -- --ignored`.
    /// The source is only read (copied with VACUUM INTO); the copy is migrated.
    #[tokio::test]
    #[ignore]
    async fn real_database_survives_migration() {
        let source = PathBuf::from(
            std::env::var("FLOWBOARD_MIGRATION_SOURCE").expect("set FLOWBOARD_MIGRATION_SOURCE"),
        );
        let path = temp_db("real");
        let mut src = SqliteConnectOptions::from_str(&sqlite_url(&source, "ro"))
            .unwrap()
            .connect()
            .await
            .unwrap();
        sqlx::query("VACUUM INTO ?")
            .bind(path.to_string_lossy().to_string())
            .execute(&mut src)
            .await
            .unwrap();
        src.close().await.unwrap();

        let mut conn = SqliteConnectOptions::from_str(&sqlite_url(&path, "rw"))
            .unwrap()
            .connect()
            .await
            .unwrap();
        let tables: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_sqlx_migrations' ORDER BY name",
        )
        .fetch_all(&mut conn)
        .await
        .unwrap();
        let mut columns = vec![];
        for t in tables {
            let cols: Vec<String> =
                sqlx::query_scalar(&format!("SELECT name FROM pragma_table_info('{t}')"))
                    .fetch_all(&mut conn)
                    .await
                    .unwrap();
            columns.push((t, cols));
        }
        let before = snapshot(&mut conn, &columns).await;
        conn.close().await.unwrap();

        let pool = open_and_migrate(&path).await.unwrap();
        let mut conn = pool.acquire().await.unwrap();
        let after = snapshot(&mut conn, &columns).await;
        let fk_violations: Vec<(String,)> = sqlx::query_as("SELECT \"table\" FROM pragma_foreign_key_check")
            .fetch_all(&mut *conn)
            .await
            .unwrap();
        drop(conn);
        pool.close().await;

        for ((table, rows_before), (_, rows_after)) in before.iter().zip(after.iter()) {
            println!("{table}: {} rows before, {} after", rows_before.len(), rows_after.len());
            assert_eq!(rows_before, rows_after, "table {table} changed during migration");
        }
        assert!(fk_violations.is_empty(), "foreign key violations: {fk_violations:?}");
        assert_eq!(backups_in(&path), 1, "the migration must have written a backup");
    }

    #[tokio::test]
    async fn migration_012_backfills_only_unsized_factory_stories() {
        let path = temp_db("points-backfill");
        migrate_up_to(&path, 12).await;
        let mut conn = SqliteConnectOptions::from_str(&sqlite_url(&path, "rw"))
            .unwrap()
            .foreign_keys(false)
            .connect()
            .await
            .unwrap();
        let task = |id: i64, project: i64, parent: Option<i64>, kind: &str, status: &str, points: i64| {
            format!(
                "INSERT INTO tasks (id, project_id, parent_id, title, type, status, story_points, created_at, updated_at, task_number)                  VALUES ({id}, {project}, {}, 't', '{kind}', '{status}', {points}, '2026-01-01', '2026-01-01', {id})",
                parent.map_or("NULL".to_string(), |p| p.to_string())
            )
        };
        let mut seed = vec![
            "INSERT INTO projects (id, name, key, created_at, ladder) VALUES (1, 'F', 'F', '2026-01-01', 'factory')".to_string(),
            "INSERT INTO projects (id, name, key, created_at) VALUES (2, 'L', 'L', '2026-01-01')".to_string(),
        ];
        // Factory Story 1: two counted Subtasks, a bug and a canceled one.
        seed.push(task(1, 1, None, "story", "building", 0));
        seed.push(task(2, 1, Some(1), "subtask", "done", 3));
        seed.push(task(3, 1, Some(1), "subtask", "todo", 2));
        seed.push(task(4, 1, Some(1), "bug", "todo", 5));
        seed.push(task(5, 1, Some(1), "subtask", "canceled", 8));
        // Factory Story 6: no Subtasks. Factory Story 7: already sized.
        seed.push(task(6, 1, None, "story", "backlog", 0));
        seed.push(task(7, 1, None, "story", "ready", 13));
        seed.push(task(8, 1, Some(7), "subtask", "todo", 1));
        // Legacy Story 9 with a Subtask.
        seed.push(task(9, 2, None, "story", "todo", 0));
        seed.push(task(10, 2, Some(9), "subtask", "todo", 2));
        for sql in &seed {
            sqlx::query(sql).execute(&mut conn).await.unwrap();
        }
        conn.close().await.unwrap();

        let pool = open_and_migrate(&path).await.unwrap();
        let points: Vec<(i64, i64)> = sqlx::query_as("SELECT id, story_points FROM tasks WHERE type = 'story' ORDER BY id")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(points, vec![(1, 5), (6, 0), (7, 13), (9, 0)]);
        pool.close().await;
    }

    #[tokio::test]
    async fn migration_011_renames_task_type_and_keeps_links() {
        let path = temp_db("subtask-type");
        migrate_up_to(&path, 11).await;
        let mut conn = SqliteConnectOptions::from_str(&sqlite_url(&path, "rw"))
            .unwrap()
            .foreign_keys(false)
            .connect()
            .await
            .unwrap();
        for sql in [
            "INSERT INTO projects (id, name, key, created_at) VALUES (1, 'P', 'P', '2026-01-01')",
            "INSERT INTO people (id, name, email) VALUES (1, 'A', 'a@x')",
            "INSERT INTO tasks (id, project_id, title, type, status, created_at, updated_at, task_number)              VALUES (1, 1, 'Story', 'story', 'todo', '2026-01-01', '2026-01-01', 1)",
            "INSERT INTO tasks (id, project_id, parent_id, title, type, status, created_at, updated_at, task_number)              VALUES (2, 1, 1, 'Child', 'task', 'todo', '2026-01-01', '2026-01-01', 2)",
            "INSERT INTO comments (task_id, author_id, body, created_at) VALUES (2, 1, 'hi', '2026-01-01')",
            "INSERT INTO time_logs (task_id, person_id, minutes, logged_at) VALUES (2, 1, 30, '2026-01-01')",
            "INSERT INTO activity_log (task_id, person_id, action, created_at) VALUES (2, 1, 'created', '2026-01-01')",
        ] {
            sqlx::query(sql).execute(&mut conn).await.unwrap();
        }
        conn.close().await.unwrap();

        let pool = open_and_migrate(&path).await.unwrap();
        let (kind, parent): (String, Option<i64>) =
            sqlx::query_as("SELECT type, parent_id FROM tasks WHERE id = 2")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(kind, "subtask");
        assert_eq!(parent, Some(1));
        for table in ["comments", "time_logs", "activity_log"] {
            let n: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table} WHERE task_id = 2"))
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(n, 1, "{table} row must survive the rebuild");
        }
        let story_kind: String = sqlx::query_scalar("SELECT type FROM tasks WHERE id = 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(story_kind, "story");

        let rejected = sqlx::query(
            "INSERT INTO tasks (project_id, title, type, created_at, updated_at) VALUES (1, 'x', 'task', 'now', 'now')",
        )
        .execute(&pool)
        .await;
        assert!(rejected.is_err(), "type = 'task' must be rejected by the CHECK");

        let default_kind: String = sqlx::query_scalar(
            "INSERT INTO tasks (project_id, title, created_at, updated_at) VALUES (1, 'y', 'now', 'now') RETURNING type",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(default_kind, "subtask");
        pool.close().await;
    }

    /// QA (FB-122): the 011 rebuild keeps every 010 column value, every index,
    /// the remaining child tables (attachments, task_links, task_prs), and live FKs.
    #[tokio::test]
    async fn migration_011_keeps_columns_indexes_and_all_fk_children() {
        let path = temp_db("subtask-type-full");
        migrate_up_to(&path, 11).await;
        let mut conn = SqliteConnectOptions::from_str(&sqlite_url(&path, "rw"))
            .unwrap()
            .foreign_keys(false)
            .connect()
            .await
            .unwrap();
        for sql in [
            "INSERT INTO projects (id, name, key, created_at) VALUES (1, 'P', 'P', '2026-01-01')",
            "INSERT INTO people (id, name, email) VALUES (1, 'A', 'a@x')",
            "INSERT INTO sprints (id, project_id, name, status, start_date, end_date) VALUES (1, 1, 'S1', 'active', '2026-01-01', '2026-01-14')",
            "INSERT INTO releases (id, project_id, version, created_at) VALUES (1, 1, '1.0.0', '2026-01-01')",
            "INSERT INTO tasks (id, project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, due_date, created_at, updated_at, labels, task_number, feature_branch, review_verdict, reviewed_commit, findings_url, run_stopped, risk, release_id) \
             VALUES (1, 1, 1, 'Story', 'd', 'story', 'building', 'high', 1, 5, '2026-02-01', '2026-01-01', '2026-01-02', 'a,b', 1, 'feat/P-1-x', 'passed', 'abc', 'http://f', 1, 0, 1)",
            "INSERT INTO tasks (id, project_id, parent_id, title, type, status, created_at, updated_at, task_number, risk) VALUES (2, 1, 1, 'Child', 'task', 'todo', '2026-01-01', '2026-01-01', 2, 1)",
            "INSERT INTO tasks (id, project_id, parent_id, title, type, status, created_at, updated_at, task_number) VALUES (3, 1, 1, 'Bug', 'bug', 'todo', '2026-01-01', '2026-01-01', 3)",
            "INSERT INTO tasks (id, project_id, title, type, status, created_at, updated_at, task_number) VALUES (4, 1, 'Epic', 'epic', 'todo', '2026-01-01', '2026-01-01', 4)",
            "INSERT INTO attachments (task_id, filename, filepath, size, uploaded_at) VALUES (2, 'f', '/f', 1, '2026-01-01')",
            "INSERT INTO task_links (task_id, depends_on_id, created_at) VALUES (1, 4, '2026-01-01')",
            "INSERT INTO task_prs (task_id, url, created_at, updated_at) VALUES (1, 'http://pr', '2026-01-01', '2026-01-01')",
            "INSERT INTO comments (task_id, author_id, body, created_at) VALUES (2, 1, 'hi', '2026-01-01')",
        ] {
            sqlx::query(sql).execute(&mut conn).await.unwrap();
        }
        const SNAPSHOT: &str = "SELECT quote(id)||'|'||quote(project_id)||'|'||quote(sprint_id)||'|'||quote(parent_id)||'|'||quote(title)||'|'||quote(description)||'|'||quote(status)||'|'||quote(priority)||'|'||quote(assignee_id)||'|'||quote(story_points)||'|'||quote(due_date)||'|'||quote(created_at)||'|'||quote(updated_at)||'|'||quote(labels)||'|'||quote(task_number)||'|'||quote(feature_branch)||'|'||quote(review_verdict)||'|'||quote(reviewed_commit)||'|'||quote(findings_url)||'|'||quote(run_stopped)||'|'||quote(risk)||'|'||quote(release_id) FROM tasks ORDER BY id";
        let before_rows: Vec<(String,)> = sqlx::query_as(SNAPSHOT).fetch_all(&mut conn).await.unwrap();
        assert!(before_rows[0].0.contains("'feat/P-1-x'"));
        let before: Vec<(String, String)> = sqlx::query_as(
            "SELECT name, IFNULL(sql, '') FROM sqlite_master WHERE type = 'index' AND tbl_name = 'tasks' ORDER BY name",
        )
        .fetch_all(&mut conn)
        .await
        .unwrap();
        conn.close().await.unwrap();

        let pool = open_and_migrate(&path).await.unwrap();

        let after_rows: Vec<(String,)> = sqlx::query_as(SNAPSHOT).fetch_all(&pool).await.unwrap();
        assert_eq!(after_rows, before_rows, "every 010 column value must be copied unchanged (type aside)");
        let kinds: Vec<(i64, String, i64)> = sqlx::query_as("SELECT id, type, risk FROM tasks ORDER BY id")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(
            kinds,
            vec![(1, "story".into(), 0), (2, "subtask".into(), 1), (3, "bug".into(), 0), (4, "epic".into(), 0)]
        );
        let leftover: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE type = 'task'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(leftover, 0);

        let after: Vec<(String, String)> = sqlx::query_as(
            "SELECT name, IFNULL(sql, '') FROM sqlite_master WHERE type = 'index' AND tbl_name = 'tasks' ORDER BY name",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(after, before, "011 must recreate exactly the 010 indexes");

        for (table, id) in [("attachments", 2), ("task_links", 1), ("task_prs", 1), ("comments", 2)] {
            let n: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table} WHERE task_id = ?"))
                .bind(id)
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(n, 1, "{table} row must survive the rebuild");
        }
        let violations: Vec<(String,)> = sqlx::query_as("SELECT \"table\" FROM pragma_foreign_key_check")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert!(violations.is_empty(), "FK violations after 011: {violations:?}");
        let stray: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE name = 'tasks_new'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(stray, 0);

        // FKs still point at the rebuilt table: deleting the Story nulls the
        // children's parent_id and cascades its links and PRs.
        sqlx::query("DELETE FROM tasks WHERE id = 1").execute(&pool).await.unwrap();
        let parents: Vec<(Option<i64>,)> = sqlx::query_as("SELECT parent_id FROM tasks WHERE id IN (2, 3) ORDER BY id")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(parents, vec![(None,), (None,)]);
        let links: i64 = sqlx::query_scalar("SELECT (SELECT COUNT(*) FROM task_links) + (SELECT COUNT(*) FROM task_prs)")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(links, 0);
        sqlx::query("DELETE FROM tasks WHERE id = 2").execute(&pool).await.unwrap();
        let children: i64 = sqlx::query_scalar("SELECT (SELECT COUNT(*) FROM attachments) + (SELECT COUNT(*) FROM comments)")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(children, 0);
        pool.close().await;
    }

    #[tokio::test]
    async fn open_existing_accepts_a_current_database() {
        let path = temp_db("current");
        open_and_migrate(&path).await.unwrap().close().await;
        open_existing(&path).await.unwrap().close().await;
    }
}
