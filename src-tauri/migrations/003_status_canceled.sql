-- no-transaction
-- Add 'canceled' to the tasks.status CHECK constraint (it sits between
-- 'in_review' and 'done' in the UI column order). SQLite cannot ALTER a CHECK
-- constraint, so the table must be rebuilt.
--
-- foreign_keys MUST be OFF for the rebuild: DROP TABLE on a parent performs an
-- implicit DELETE that fires ON DELETE CASCADE/SET NULL on the child tables
-- (comments, time_logs, attachments, activity_log) and on tasks.parent_id. With
-- foreign keys disabled those actions are skipped, and the data is preserved in
-- tasks_new. PRAGMA foreign_keys is a no-op inside a transaction, hence the
-- `-- no-transaction` directive above.

PRAGMA foreign_keys = OFF;

CREATE TABLE tasks_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sprint_id    INTEGER          REFERENCES sprints(id)  ON DELETE SET NULL,
  parent_id    INTEGER          REFERENCES tasks(id)    ON DELETE SET NULL,
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  type         TEXT    NOT NULL CHECK (type IN ('story','bug','task','epic'))                          DEFAULT 'task',
  status       TEXT    NOT NULL CHECK (status IN ('todo','in_progress','in_review','canceled','done')) DEFAULT 'todo',
  priority     TEXT    NOT NULL CHECK (priority IN ('low','medium','high','critical'))                 DEFAULT 'medium',
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

PRAGMA foreign_keys = ON;
