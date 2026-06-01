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
comments      (id, task_id, author_id, body, created_at)
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
- Story → child sprint cascade: when `update_task` mutates `sprint_id` on a row
  where `type = 'story'`, the same SQL transaction also updates `sprint_id` for
  all rows where `parent_id` equals the story's id. Atomic — both updates apply
  or neither.