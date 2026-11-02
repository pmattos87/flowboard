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
              -- type:        'story' | 'bug' | 'subtask' | 'epic'
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
  - `tasks.epic_id`     → ON DELETE SET NULL (a Story survives its epic's deletion; migration 013)
  - `projects.client_id` → ON DELETE SET NULL (a project survives its client's deletion, internal again; migration 015)
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
- `tasks.type` holds `'subtask'`, not `'task'` (migration `011_subtask_type.sql`, FB-101): the
  CHECK vocabulary is `story | bug | subtask | epic`, existing `'task'` rows were migrated with
  their links intact, and an insert without a type defaults to `'subtask'`. The table itself
  keeps the name `tasks` (see D-013).
- Story → child sprint cascade: when `update_task` mutates `sprint_id` on a row
  where `type = 'story'`, the same SQL transaction also updates `sprint_id` for
  all rows where `parent_id` equals the story's id. Atomic — both updates apply
  or neither.
- Sprint completion (FB-97): `complete_sprint(sprint_id, target)` is the only way a sprint becomes
  `completed`; `update_sprint` refuses that status change. In one transaction it moves every
  unfinished row (not `done`/`canceled`) to the target (an open sprint of the same project,
  Backlog, or a sprint it creates) and sets the sprint `completed`; any refusal rolls back
  everything. Moves to a sprint keep status; to Backlog, legacy Stories reset to
  `ready_for_development` (with a `status_changed` activity row) and Factory Stories must be
  `ready`. Factory Stories move through the same tx-taking `set_sprint` as `story_set_sprint`.
-------------------------
Software Factory (migration `010_factory_foundation.sql`, SF-2)

Additive only: legacy projects keep their statuses and rows. Factory columns and
tables are written **only** through `flowboard-cli` (or its MCP,
`flowboard-cli mcp`), which enforces the ladders; the app reads them.

```sql
projects      + ladder ('legacy' default | 'factory')
              (+ kind, dropped by migration 015: now derived from client_id, see Clients below)
people        + factory_role ('owner' | 'agent' | NULL; at most one of each)
tasks         + status values 'backlog','ready','building','integrated_tests','tested','user_testing'
              + feature_branch, review_verdict ('passed'|'failed'|NULL), reviewed_commit,
                findings_url, run_stopped (0/1), risk (0/1),
                release_id → releases(id) ON DELETE SET NULL
tasks         + epic_id → tasks(id) ON DELETE SET NULL   -- migration 013_epic_link.sql (FB-224)
releases         (id, project_id, version, state, created_at, released_at)
                 -- state: 'planned' | 'user_testing' | 'released' | 'canceled'; UNIQUE(project_id, version)
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
- What is a Story on a Factory project (FB-52; no schema change): the parent decides. A
  `story` or a `bug` with `parent_id` NULL is a Story (a bug Story is a fix) and takes the Story
  ladder; a `bug` or `subtask` whose parent is a Story is a Subtask (a bug Subtask is a defect
  found while testing that Story) and takes the Subtask ladder. On a Factory project
  `update_task` refuses a `parent_id` or `type` change that crosses Story level and Subtask
  level; `story` <-> `bug` on a top-level row is allowed. On a legacy project a top-level `bug`
  is not a Story: it keeps dev statuses and is unparented. The predicate is `is_story_level` /
  `story_level_sql` in `factory/ops.rs`. "Waiting on bugs" counts only `bug` children.
- Epics (FB-224): a top-level `epic` on a Factory project groups Stories by goal and is never
  built. Its lifecycle is `todo` (open) → `done` or `canceled`, never reopened; it takes no
  sprint, no points and no Subtasks. A Story (feature or bug Story) is linked to its epic with
  `tasks.epic_id`, never `parent_id` (a Story with a parent stops being a Story). The link is
  set with `update_task` (`epic_id`; `null` clears it, absent leaves it) or `story_edit`
  (`epic`), and only on a Factory Story that is not `done`/`canceled` (their epic is frozen),
  into an open (`todo`) epic of the same project; taking a Story out is otherwise always
  allowed. Legacy projects never set it. Migration `013_epic_link.sql` adds the column with
  `ALTER TABLE ADD COLUMN` (no rebuild); existing rows read NULL. A Factory Subtask's parent
  must be a Story, and switching a project to the Factory ladder counts an epic at `todo`
  (or closed) as mapped.
- A Factory Story's `story_points` is the sum of its non-bug, non-canceled Subtasks' points,
  kept by every write path (CLI, MCP and app); the app refuses a direct edit. `refining → ready`
  is refused while it is 0. Migration `012_story_points_backfill.sql` filled it in once for
  Stories split before this rule (SF-68).
- A Story in a sprint is `ready` or later; `building` and beyond require a sprint.
  Forward moves from `building` on require every Subtask done/canceled and the Run not stopped.
- Assignee is set by the move: `building` → agent, `user_testing` → the primary contact of
  the project's client, `done`/`canceled` → NULL, everything else → owner.
- Run trail = `activity_log` rows on the Story with actions `stage_entered`,
  `subtask_status_changed`, `subtask_handoff`, `verify_started`, `verify_round`, `review_started`, `review_round`,
  `run_stopped`, `run_restarted`, `pr_opened`, `pr_merged`, `release_picked`,
  `release_removed`, `bug_subtask_filed` (details as JSON in `new_value`).
- The app backs up the database (`flowboard.db.pre-migration-<unix secs>.bak`) before
  applying pending migrations, and runs in WAL mode. The CLI never migrates and refuses a
  database whose applied migrations differ from its own.

-------------------------
Clients (migration `015_clients.sql`, FB-202)

A client is an organization; a project is one solution for a client, or internal.

```sql
clients          (id, name, position)                  -- position: sidebar order (ascending)
projects         + client_id → clients(id) ON DELETE SET NULL   -- NULL = internal
client_contacts  (client_id, person_id, is_primary)    -- PK (client_id, person_id); both FKs
                 -- ON DELETE CASCADE; at most one is_primary = 1 per client
                 -- (idx_client_contacts_primary)
```

- `projects.kind` is no longer stored: a project is `'client'` iff `client_id` is set, else
  `'internal'`. The API still returns `kind`, computed (`Project` JSON from the projects
  commands, `project_show`). Migration 015 dropped the column in place with
  `ALTER TABLE projects DROP COLUMN kind` (no rebuild) and starts every project internal.
- Contacts belong to the client, not the project: `project_contacts` (migration 010) was
  replaced by `client_contacts`. `project_show` lists the contacts of the project's client.
  Contacts are set only with `flowboard-cli contact add/remove <client id> <person id>`;
  `flowboard-cli client list` lists clients; `flowboard-cli project set --client <id|none>`
  sets or clears a project's client.
- Ordering: `projects.position` orders projects inside their group (one group per client, plus
  the internal group); `clients.position` orders the Clients section. A project whose client
  changes (the app's `update_project`, or `flowboard-cli project set --client`) goes to the
  end of its new group (`MAX(position) + 1` among that group's projects); setting the same
  client again, or any other update, keeps its position.
- Deleting a client leaves its projects in place, internal again, and drops its contacts.

-------------------------
Project state (migration `016_project_state.sql`, FB-14)

```sql
projects         + state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','archived'))
```

- Added with `ALTER TABLE ADD COLUMN` only (no rebuild); every existing project reads `active`.
- Set only by the app's `set_project_state(id, state)` command (no CLI/MCP command); either
  direction is allowed at any time, except that archiving is refused while the project has an
  `active` sprint or a Release in `planned`/`user_testing`. The refusal names that sprint or
  Release version and changes nothing.
- `state` is returned in the `Project` JSON (`list_projects`, `get_project`) and by `project_show`.
