# FlowBoard — Database Schema

**Canonical SQLite Schema Reference**

## Tables

```sql
projects      (id, name, key, description, color, created_at)
people        (id, name, email, avatar_color, role)
sprints       (id, project_id, name, goal, start_date, end_date, status)
              -- status: 'backlog' | 'active' | 'completed'
tasks         (id, project_id, task_number, sprint_id, parent_id, title, description,
               type, status, priority, assignee_id, story_points,
               due_date, created_at, updated_at, labels)
              -- type:        'story' | 'bug' | 'task' | 'epic'
              -- status:      'todo' | 'in_progress' | 'in_review' | 'canceled' | 'done'
              -- priority:    'low' | 'medium' | 'high' | 'critical'
              -- task_number: per-project sequence (see Important Rules)
comments      (id, task_id, author_id, body, created_at, updated_at)
              -- updated_at: NULL until the comment is edited (FB-46)
time_logs     (id, task_id, person_id, minutes, logged_at, note)
attachments   (id, task_id, filename, filepath, size, uploaded_at)
activity_log  (id, task_id, person_id, action, old_value, new_value, created_at)

-------------------------
Important Rules

- Nullable foreign keys (handled as `Option<i64>` in Rust, `number | null` in TypeScript):
  - `tasks.sprint_id`   → ON DELETE SET NULL (task survives sprint deletion)
  - `tasks.parent_id`   → ON DELETE SET NULL (sub-tasks survive parent deletion)
  - `tasks.assignee_id` → ON DELETE SET NULL (task survives assignee deletion)
- All other foreign keys are NOT NULL with ON DELETE CASCADE:
  - `sprints.project_id`, `tasks.project_id`, `comments.task_id`, `comments.author_id`,
    `time_logs.task_id`, `time_logs.person_id`, `attachments.task_id`,
    `activity_log.task_id`, `activity_log.person_id`
- `updated_at` must be automatically updated on any task modification.
- Labels are stored as comma-separated string.
- Timestamps use ISO strings.
- `created_at` / `updated_at` should be set in the backend.
- `tasks.task_number` is `INTEGER NOT NULL`, assigned per-project on insert
  (next value = `MAX(task_number) + 1` scoped to `project_id`).
  Uniqueness enforced by `UNIQUE(project_id, task_number)` via
  `idx_tasks_project_number` (migration `002_task_number.sql`).
  The internal PK `tasks.id` is unchanged; all foreign keys continue to
  reference `tasks.id`. User-facing task keys render as
  `{projects.key}-{tasks.task_number}` (e.g. `P1-1`, `P1-2`).
- `comments.updated_at` is nullable and set only by `update_comment`; a NULL
  means the comment has never been edited (migration `009_comment_edited_at.sql`).
  Editing changes `body` only — `author_id` is fixed at creation.
- Story → child sprint cascade: when `update_task` mutates `sprint_id` on a row
  where `type = 'story'`, the same SQL transaction also updates `sprint_id` for
  all rows where `parent_id` equals the story's id. Atomic — both updates apply
  or neither.
-------------------------
Software Factory (migration `010_factory_foundation.sql`, SF-2)

Additive only: legacy projects keep their statuses and rows. Factory columns and
tables are written **only** through `flowboard-cli` (or its MCP,
`flowboard-cli mcp`), which enforces the ladders; the app reads them.

```sql
projects      + ladder ('legacy' default | 'factory'), kind ('internal' default | 'client')
people        + factory_role ('owner' | 'agent' | NULL; at most one of each)
tasks         + status values 'backlog','ready','building','integrated_tests','tested','user_testing'
              + feature_branch, review_verdict ('passed'|'failed'|NULL), reviewed_commit,
                findings_url, run_stopped (0/1), risk (0/1),
                release_id → releases(id) ON DELETE SET NULL
releases         (id, project_id, version, state, created_at, released_at)
                 -- state: 'planned' | 'user_testing' | 'released' | 'canceled'; UNIQUE(project_id, version)
project_contacts (project_id, person_id, is_primary)   -- client contacts; one primary per project
task_links       (task_id, depends_on_id, created_at)  -- Story depends-on (warns on Release pick)
task_prs         (id, task_id, url, target, state, created_at, updated_at)
                 -- state: 'open' | 'merged' | 'closed'
```

- Story ladder (Factory projects): `backlog ⇄ refining ⇄ ready → building ⇄ integrated_tests
  → tested → user_testing (Client only) → done`; bug loop back to `building` from
  `integrated_tests`/`tested`/`user_testing`; any open status → `canceled`; `canceled` →
  `backlog`/`refining`/`ready` (reopen; inside a sprint only `ready`). `done` is terminal.
  Subtask ladder: `todo ⇄ in_progress → done`, `todo`/`in_progress` → `canceled`,
  `canceled` → `todo` (reopen).
- A Story in a sprint is `ready` or later; `building` and beyond require a sprint.
  Forward moves from `building` on require every Subtask done/canceled and the Run not stopped.
- Assignee is set by the move: `building` → agent, `user_testing` → primary contact,
  `done`/`canceled` → NULL, everything else → owner.
- Run trail = `activity_log` rows on the Story with actions `stage_entered`,
  `subtask_status_changed`, `subtask_handoff`, `verify_round`, `review_round`,
  `run_stopped`, `run_restarted`, `pr_opened`, `pr_merged`, `release_picked`,
  `release_removed`, `bug_subtask_filed` (details as JSON in `new_value`).
- The app backs up the database (`flowboard.db.pre-migration-<unix secs>.bak`) before
  applying pending migrations, and runs in WAL mode. The CLI never migrates and refuses a
  database whose applied migrations differ from its own.
