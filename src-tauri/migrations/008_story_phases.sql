-- no-transaction
-- FB-85: add the discovery-lifecycle statuses 'refining' and
-- 'ready_for_development' to the tasks.status CHECK constraint. They sit before
-- 'canceled' in the discovery board column order (To Do -> Refining -> Canceled
-- -> Ready for Development). SQLite cannot ALTER a CHECK constraint, so the table
-- must be rebuilt.
--
-- foreign_keys MUST be OFF for the rebuild: DROP TABLE on a parent performs an
-- implicit DELETE that fires ON DELETE CASCADE/SET NULL on the child tables
-- (comments, time_logs, attachments, activity_log) and on tasks.parent_id. FK
-- enforcement is disabled at connect time by db::init_pool (the in-SQL PRAGMA
-- below is a no-op inside sqlx's migration transaction — see LESSONS.md FB-36).

PRAGMA foreign_keys = OFF;

CREATE TABLE tasks_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sprint_id    INTEGER          REFERENCES sprints(id)  ON DELETE SET NULL,
  parent_id    INTEGER          REFERENCES tasks(id)    ON DELETE SET NULL,
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  type         TEXT    NOT NULL CHECK (type IN ('story','bug','task','epic'))                                                              DEFAULT 'task',
  status       TEXT    NOT NULL CHECK (status IN ('todo','in_progress','in_review','refining','ready_for_development','canceled','done')) DEFAULT 'todo',
  priority     TEXT    NOT NULL CHECK (priority IN ('low','medium','high','critical'))                                                     DEFAULT 'medium',
  assignee_id  INTEGER          REFERENCES people(id)   ON DELETE SET NULL,
  story_points INTEGER NOT NULL DEFAULT 0,
  due_date     TEXT,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL,
  labels       TEXT    NOT NULL DEFAULT '',
  task_number  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO tasks_new (
  id, project_id, sprint_id, parent_id, title, description, type, status,
  priority, assignee_id, story_points, due_date, created_at, updated_at,
  labels, task_number
)
SELECT
  id, project_id, sprint_id, parent_id, title, description, type, status,
  priority, assignee_id, story_points, due_date, created_at, updated_at,
  labels, task_number
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX idx_tasks_project   ON tasks(project_id);
CREATE INDEX idx_tasks_sprint    ON tasks(sprint_id);
CREATE INDEX idx_tasks_status    ON tasks(status);
CREATE INDEX idx_tasks_assignee  ON tasks(assignee_id);
CREATE UNIQUE INDEX idx_tasks_project_number ON tasks(project_id, task_number);

-- Data-preserving remap of backlog stories/epics so none disappear from the
-- Discovery board (whose columns are now todo/refining/canceled/ready_for_development).
-- Only unscheduled (sprint_id IS NULL) stories/epics are affected; in-sprint items
-- keep their dev-workflow status.
UPDATE tasks SET status = 'ready_for_development'
  WHERE sprint_id IS NULL AND type IN ('story','epic') AND status = 'done';
UPDATE tasks SET status = 'refining'
  WHERE sprint_id IS NULL AND type IN ('story','epic') AND status IN ('in_progress','in_review');

PRAGMA foreign_keys = ON;
