use sqlx::SqlitePool;
use tauri::State;

/// Returns true when running a debug build (tauri dev). Always false in release.
#[tauri::command]
pub fn is_staging_build() -> bool {
    cfg!(debug_assertions)
}

/// Populate the database with realistic demo data for staging / manual testing.
///
/// - `force = false`: skips if any projects already exist (idempotent).
/// - `force = true`:  deletes ALL data in FK-safe order, resets sequences,
///   then re-inserts fresh seed data.
///
/// Returns a human-readable summary string on success.
#[tauri::command]
pub async fn seed_demo_data(
    pool: State<'_, SqlitePool>,
    force: bool,
) -> Result<String, String> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects")
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    if count > 0 && !force {
        return Ok(
            "Skipped: data already exists. Use 'Force re-seed' to overwrite.".into(),
        );
    }

    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;

    if force {
        // Delete in reverse FK dependency order so cascades don't interfere.
        for table in &[
            "activity_log",
            "time_logs",
            "comments",
            "attachments",
            "tasks",
            "sprints",
            "projects",
            "people",
        ] {
            sqlx::query(&format!("DELETE FROM {table}"))
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }
        // Reset AUTOINCREMENT counters so IDs start from 1 on each re-seed.
        sqlx::query("DELETE FROM sqlite_sequence")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    // ── People ──────────────────────────────────────────────────────────────
    let alice_id: i64 = sqlx::query_scalar(
        "INSERT INTO people (name, email, avatar_color, role) VALUES (?, ?, ?, ?) RETURNING id",
    )
    .bind("Alice Chen")
    .bind("alice@flowboard.dev")
    .bind("#6366f1")
    .bind("Developer")
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let bob_id: i64 = sqlx::query_scalar(
        "INSERT INTO people (name, email, avatar_color, role) VALUES (?, ?, ?, ?) RETURNING id",
    )
    .bind("Bob Martinez")
    .bind("bob@flowboard.dev")
    .bind("#ef4444")
    .bind("QA Engineer")
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let clara_id: i64 = sqlx::query_scalar(
        "INSERT INTO people (name, email, avatar_color, role) VALUES (?, ?, ?, ?) RETURNING id",
    )
    .bind("Clara Schmidt")
    .bind("clara@flowboard.dev")
    .bind("#ec4899")
    .bind("UX Designer")
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let david_id: i64 = sqlx::query_scalar(
        "INSERT INTO people (name, email, avatar_color, role) VALUES (?, ?, ?, ?) RETURNING id",
    )
    .bind("David Kim")
    .bind("david@flowboard.dev")
    .bind("#f59e0b")
    .bind("Product Manager")
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let eve_id: i64 = sqlx::query_scalar(
        "INSERT INTO people (name, email, avatar_color, role) VALUES (?, ?, ?, ?) RETURNING id",
    )
    .bind("Eve Johnson")
    .bind("eve@flowboard.dev")
    .bind("#10b981")
    .bind("DevOps Engineer")
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // ── Projects ─────────────────────────────────────────────────────────────
    let now = "2025-01-01T00:00:00.000Z";

    let fbp_id: i64 = sqlx::query_scalar(
        "INSERT INTO projects (name, key, description, color, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id",
    )
    .bind("FlowBoard Platform")
    .bind("FBP")
    .bind("The core desktop project management application.")
    .bind("#6366f1")
    .bind(now)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let mob_id: i64 = sqlx::query_scalar(
        "INSERT INTO projects (name, key, description, color, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id",
    )
    .bind("Mobile App")
    .bind("MOB")
    .bind("React Native companion app for FlowBoard.")
    .bind("#10b981")
    .bind(now)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // ── Sprints — FlowBoard Platform ─────────────────────────────────────────
    let fbp_s1: i64 = sqlx::query_scalar(
        "INSERT INTO sprints (project_id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id)
    .bind("Sprint 1 — Foundation")
    .bind("Set up the project skeleton, DB schema, and initial Tauri commands.")
    .bind("2025-01-06")
    .bind("2025-01-17")
    .bind("completed")
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let fbp_s2: i64 = sqlx::query_scalar(
        "INSERT INTO sprints (project_id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id)
    .bind("Sprint 2 — Core Features")
    .bind("Deliver the Kanban board, drag-and-drop, and sprint planning.")
    .bind("2025-05-12")
    .bind("2025-05-23")
    .bind("active")
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let fbp_s3: i64 = sqlx::query_scalar(
        "INSERT INTO sprints (project_id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id)
    .bind("Sprint 3 — Polish")
    .bind("Search, keyboard shortcuts, and visual refinements.")
    .bind("2025-05-26")
    .bind("2025-06-06")
    .bind("backlog")
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // ── Sprints — Mobile App ─────────────────────────────────────────────────
    let mob_s1: i64 = sqlx::query_scalar(
        "INSERT INTO sprints (project_id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(mob_id)
    .bind("Sprint 1 — MVP Setup")
    .bind("Bootstrap the React Native project and set up the API client.")
    .bind("2025-01-13")
    .bind("2025-01-24")
    .bind("completed")
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let mob_s2: i64 = sqlx::query_scalar(
        "INSERT INTO sprints (project_id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(mob_id)
    .bind("Sprint 2 — User Auth")
    .bind("Implement login, registration, and password-reset flows.")
    .bind("2025-05-12")
    .bind("2025-05-23")
    .bind("active")
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let mob_s3: i64 = sqlx::query_scalar(
        "INSERT INTO sprints (project_id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(mob_id)
    .bind("Sprint 3 — Beta Prep")
    .bind("Push notifications, offline mode groundwork, and QA hardening.")
    .bind("2025-05-26")
    .bind("2025-06-06")
    .bind("backlog")
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // ── Tasks — FBP Sprint 1 (completed) ────────────────────────────────────
    let ts = "2025-01-06T09:00:00.000Z";

    let t1: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id).bind(fbp_s1)
    .bind("Set up Tauri + Vite project")
    .bind("Bootstrap the monorepo with Tauri v2, React 18, Vite, Tailwind, and shadcn/ui.")
    .bind("epic").bind("done").bind("high")
    .bind(alice_id).bind(8).bind(ts).bind(ts).bind("setup")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t2: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id).bind(fbp_s1)
    .bind("Design SQLite schema and migrations")
    .bind("Define all tables, indices, FK rules, and write the initial sqlx migration.")
    .bind("task").bind("done").bind("high")
    .bind(david_id).bind(5).bind(ts).bind(ts).bind("database")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t3: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id).bind(fbp_s1)
    .bind("Implement project CRUD Tauri commands")
    .bind("create_project, list_projects, get_project, update_project, delete_project.")
    .bind("story").bind("done").bind("medium")
    .bind(alice_id).bind(3).bind(ts).bind(ts).bind("backend")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t4: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id).bind(fbp_s1)
    .bind("Add CI pipeline with tsc + vitest")
    .bind("GitHub Actions workflow that runs tsc --noEmit and npx vitest run on every PR.")
    .bind("task").bind("done").bind("medium")
    .bind(eve_id).bind(2).bind(ts).bind(ts).bind("ci,devops")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    // ── Tasks — FBP Sprint 2 (active) ────────────────────────────────────────
    let ts2 = "2025-05-12T09:00:00.000Z";

    let t5: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id).bind(fbp_s2)
    .bind("Kanban board with column layout")
    .bind("Implement the four-column Kanban board with task cards and status groups.")
    .bind("story").bind("in_progress").bind("high")
    .bind(alice_id).bind(8).bind(ts2).bind(ts2).bind("ui,board")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t6: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id).bind(fbp_s2)
    .bind("Drag-and-drop cards between columns")
    .bind("Cards should be draggable across status columns using @dnd-kit. Status must update in DB on drop.")
    .bind("bug").bind("todo").bind("critical")
    .bind(bob_id).bind(5).bind(ts2).bind(ts2).bind("ui,dnd,bug")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t7: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id).bind(fbp_s2)
    .bind("Sprint planning board")
    .bind("Two-panel board: backlog on the left, sprint tasks on the right. Drag to assign.")
    .bind("story").bind("in_review").bind("medium")
    .bind(clara_id).bind(5).bind(ts2).bind(ts2).bind("ui,sprints")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t8: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id).bind(fbp_s2)
    .bind("Sprint burndown chart")
    .bind("Line chart showing remaining story points per day across the sprint duration.")
    .bind("task").bind("todo").bind("medium")
    .bind(david_id).bind(3).bind(ts2).bind(ts2).bind("reports,charts")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    // ── Tasks — FBP Sprint 3 (backlog) ───────────────────────────────────────
    let t9: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id).bind(fbp_s3)
    .bind("Global search bar")
    .bind("Search across tasks, sprints, projects, and people from the top bar.")
    .bind("story").bind("todo").bind("high")
    .bind(alice_id).bind(5).bind(ts2).bind(ts2).bind("ui,search")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t10: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id).bind(fbp_s3)
    .bind("Keyboard shortcuts reference in Settings")
    .bind("Add a Keyboard Shortcuts tab to the Settings page.")
    .bind("task").bind("todo").bind("low")
    .bind(clara_id).bind(2).bind(ts2).bind(ts2).bind("ui,a11y")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    // ── Tasks — FBP Backlog (no sprint) ──────────────────────────────────────
    let t11: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id).bind(Option::<i64>::None)
    .bind("Roadmap / timeline view")
    .bind("Gantt-style horizontal timeline showing sprints and epics across months.")
    .bind("epic").bind("todo").bind("medium")
    .bind(david_id).bind(13).bind(ts2).bind(ts2).bind("ui,roadmap")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t12: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id).bind(Option::<i64>::None)
    .bind("Reports dashboard")
    .bind("Burndown, velocity, and workload charts on the Reports page.")
    .bind("story").bind("todo").bind("medium")
    .bind(alice_id).bind(8).bind(ts2).bind(ts2).bind("reports")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t13: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id).bind(Option::<i64>::None)
    .bind("File attachments on tasks")
    .bind("Allow users to attach local files to tasks, stored with absolute paths in SQLite.")
    .bind("task").bind("todo").bind("low")
    .bind(bob_id).bind(3).bind(ts2).bind(ts2).bind("files")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t14: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(fbp_id).bind(Option::<i64>::None)
    .bind("Export board to CSV")
    .bind("Allow exporting the current board view to a CSV file.")
    .bind("story").bind("todo").bind("low")
    .bind(eve_id).bind(5).bind(ts2).bind(ts2).bind("export")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    // Suppress unused variable warnings for backlog tasks we don't reference later
    let _ = (t9, t10, t11, t12, t13, t14);

    // ── Tasks — MOB Sprint 1 (completed) ─────────────────────────────────────
    let ts3 = "2025-01-13T09:00:00.000Z";

    let t15: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(mob_id).bind(mob_s1)
    .bind("React Native project setup")
    .bind("Bootstrap Expo + TypeScript project, configure ESLint, Prettier, and testing.")
    .bind("epic").bind("done").bind("high")
    .bind(alice_id).bind(8).bind(ts3).bind(ts3).bind("setup")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t16: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(mob_id).bind(mob_s1)
    .bind("App navigation structure")
    .bind("Set up React Navigation with bottom tabs and stack navigator.")
    .bind("task").bind("done").bind("medium")
    .bind(clara_id).bind(3).bind(ts3).bind(ts3).bind("navigation")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t17: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(mob_id).bind(mob_s1)
    .bind("REST API client setup")
    .bind("Configure axios with interceptors, base URL, and typed response models.")
    .bind("task").bind("done").bind("high")
    .bind(eve_id).bind(5).bind(ts3).bind(ts3).bind("api,networking")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    // ── Tasks — MOB Sprint 2 (active) ─────────────────────────────────────────
    let ts4 = "2025-05-12T09:00:00.000Z";

    let t18: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(mob_id).bind(mob_s2)
    .bind("Login screen UI")
    .bind("Email + password login form with error states and loading indicator.")
    .bind("story").bind("in_progress").bind("high")
    .bind(clara_id).bind(5).bind(ts4).bind(ts4).bind("auth,ui")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t19: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(mob_id).bind(mob_s2)
    .bind("Registration flow")
    .bind("Multi-step registration: email → password → profile name → email verify.")
    .bind("story").bind("in_review").bind("high")
    .bind(clara_id).bind(5).bind(ts4).bind(ts4).bind("auth,ui")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t20: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(mob_id).bind(mob_s2)
    .bind("Password reset via email")
    .bind("Forgot password flow: enter email, receive OTP, set new password.")
    .bind("story").bind("todo").bind("medium")
    .bind(bob_id).bind(3).bind(ts4).bind(ts4).bind("auth")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t21: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(mob_id).bind(mob_s2)
    .bind("Biometric authentication")
    .bind("Allow TouchID/FaceID login after initial password authentication.")
    .bind("story").bind("todo").bind("low")
    .bind(alice_id).bind(5).bind(ts4).bind(ts4).bind("auth,security")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    // ── Tasks — MOB Sprint 3 (backlog) ────────────────────────────────────────
    let t22: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(mob_id).bind(mob_s3)
    .bind("Push notifications integration")
    .bind("Integrate FCM for Android and APNS for iOS. Show in-app notification toasts.")
    .bind("story").bind("todo").bind("high")
    .bind(eve_id).bind(5).bind(ts4).bind(ts4).bind("notifications")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t23: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(mob_id).bind(mob_s3)
    .bind("Offline mode with local caching")
    .bind("Cache key API responses in AsyncStorage. Show stale banner when offline.")
    .bind("epic").bind("todo").bind("critical")
    .bind(david_id).bind(13).bind(ts4).bind(ts4).bind("offline,architecture")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    // ── Tasks — MOB Backlog ───────────────────────────────────────────────────
    let t24: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(mob_id).bind(Option::<i64>::None)
    .bind("Dark mode support")
    .bind("Respect system dark-mode preference and allow manual override.")
    .bind("task").bind("todo").bind("medium")
    .bind(clara_id).bind(3).bind(ts4).bind(ts4).bind("ui,a11y")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let t25: i64 = sqlx::query_scalar(
        "INSERT INTO tasks (project_id, sprint_id, title, description, type, status, priority, assignee_id, story_points, created_at, updated_at, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(mob_id).bind(Option::<i64>::None)
    .bind("App Store submission checklist")
    .bind("Prepare screenshots, privacy policy, and metadata for App Store Connect.")
    .bind("task").bind("todo").bind("high")
    .bind(david_id).bind(5).bind(ts4).bind(ts4).bind("release")
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let _ = (t20, t21, t22, t23, t24, t25);

    // ── Comments ─────────────────────────────────────────────────────────────
    let c_ts = "2025-05-13T10:00:00.000Z";

    sqlx::query(
        "INSERT INTO comments (task_id, author_id, body, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(t5).bind(alice_id)
    .bind("Working on the column layout now. Using CSS Grid for responsive widths.")
    .bind(c_ts)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO comments (task_id, author_id, body, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(t5).bind(bob_id)
    .bind("Looks great! Can we also add keyboard navigation between cards?")
    .bind("2025-05-13T11:30:00.000Z")
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO comments (task_id, author_id, body, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(t6).bind(bob_id)
    .bind("Reproduced on Windows 10 build 19045. Cards snap back after drop.")
    .bind(c_ts)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO comments (task_id, author_id, body, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(t6).bind(david_id)
    .bind("Bumping priority to critical — this blocks the sprint review demo.")
    .bind("2025-05-14T09:00:00.000Z")
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO comments (task_id, author_id, body, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(t7).bind(clara_id)
    .bind("Design complete and in Figma. Ready for dev review.")
    .bind(c_ts)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO comments (task_id, author_id, body, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(t18).bind(clara_id)
    .bind("Figma mockups approved by David. Starting implementation.")
    .bind(c_ts)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO comments (task_id, author_id, body, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(t19).bind(bob_id)
    .bind("Happy path tested. Edge cases (invalid email format, duplicate account) still pending.")
    .bind("2025-05-15T14:00:00.000Z")
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // ── Time Logs ─────────────────────────────────────────────────────────────
    let tl_ts = "2025-01-17T17:00:00.000Z";

    // FBP Sprint 1 (completed)
    for (task_id, person_id, mins, note) in [
        (t1, alice_id,  480_i64, "Full-day setup session"),
        (t2, david_id, 300_i64, "Schema design + review"),
        (t3, alice_id,  240_i64, "CRUD commands + tests"),
        (t4, eve_id,   120_i64, "CI workflow setup"),
    ] {
        sqlx::query(
            "INSERT INTO time_logs (task_id, person_id, minutes, logged_at, note) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(task_id).bind(person_id).bind(mins).bind(tl_ts).bind(note)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // MOB Sprint 1 (completed)
    let tl_mob = "2025-01-24T17:00:00.000Z";
    for (task_id, person_id, mins, note) in [
        (t15, alice_id, 480_i64, "Project bootstrap"),
        (t16, clara_id, 180_i64, "Navigation setup"),
        (t17, eve_id,   300_i64, "API client + interceptors"),
    ] {
        sqlx::query(
            "INSERT INTO time_logs (task_id, person_id, minutes, logged_at, note) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(task_id).bind(person_id).bind(mins).bind(tl_mob).bind(note)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // ── Activity Log ─────────────────────────────────────────────────────────
    let al_ts = "2025-05-13T09:00:00.000Z";

    for (task_id, person_id, action, old_val, new_val) in [
        (t5,  alice_id, "status_changed", "todo",        "in_progress"),
        (t7,  clara_id, "status_changed", "in_progress", "in_review"),
        (t18, clara_id, "status_changed", "todo",        "in_progress"),
        (t19, clara_id, "status_changed", "in_progress", "in_review"),
        (t8,  david_id, "assigned",       "",            "David Kim"),
    ] {
        sqlx::query(
            "INSERT INTO activity_log (task_id, person_id, action, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(task_id).bind(person_id).bind(action).bind(old_val).bind(new_val).bind(al_ts)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(format!(
        "Seeded: 2 projects, 5 people, 6 sprints, 25 tasks, 7 comments, 7 time logs, 5 activity entries"
    ))
}
