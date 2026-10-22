-- FB-101: the issue type value 'task' becomes 'subtask' (the Factory term for a
-- sub-unit of a Story). Only the value changes; the tasks table keeps its name.
--
-- The tasks.type CHECK vocabulary changes, which SQLite cannot ALTER, so tasks is
-- rebuilt the same way 010 did it, mapping 'task' -> 'subtask' on the way.
--
-- foreign_keys MUST be OFF for the rebuild: DROP TABLE on a parent performs an
-- implicit DELETE that fires ON DELETE CASCADE/SET NULL on the child tables
-- (comments, time_logs, attachments, activity_log, task_links, task_prs) and on
-- tasks.parent_id. FK enforcement is disabled at connect time by
-- db::open_and_migrate (the in-SQL PRAGMA below is a no-op inside sqlx's
-- migration transaction -- see LESSONS.md FB-36).

PRAGMA foreign_keys = OFF;

CREATE TABLE tasks_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sprint_id       INTEGER          REFERENCES sprints(id)  ON DELETE SET NULL,
  parent_id       INTEGER          REFERENCES tasks(id)    ON DELETE SET NULL,
  title           TEXT    NOT NULL,
  description     TEXT    NOT NULL DEFAULT '',
  type            TEXT    NOT NULL CHECK (type IN ('story','bug','subtask','epic')) DEFAULT 'subtask',
  status          TEXT    NOT NULL CHECK (status IN (
                    'todo','in_progress','in_review','refining','ready_for_development','canceled','done',
                    'backlog','ready','building','integrated_tests','tested','user_testing'
                  )) DEFAULT 'todo',
  priority        TEXT    NOT NULL CHECK (priority IN ('low','medium','high','critical')) DEFAULT 'medium',
  assignee_id     INTEGER          REFERENCES people(id)   ON DELETE SET NULL,
  story_points    INTEGER NOT NULL DEFAULT 0,
  due_date        TEXT,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  labels          TEXT    NOT NULL DEFAULT '',
  task_number     INTEGER NOT NULL DEFAULT 0,
  feature_branch  TEXT,
  review_verdict  TEXT    CHECK (review_verdict IN ('passed','failed')),
  reviewed_commit TEXT,
  findings_url    TEXT,
  run_stopped     INTEGER NOT NULL DEFAULT 0,
  risk            INTEGER NOT NULL DEFAULT 0,
  release_id      INTEGER          REFERENCES releases(id) ON DELETE SET NULL
);

INSERT INTO tasks_new (
  id, project_id, sprint_id, parent_id, title, description, type, status,
  priority, assignee_id, story_points, due_date, created_at, updated_at,
  labels, task_number, feature_branch, review_verdict, reviewed_commit,
  findings_url, run_stopped, risk, release_id
)
SELECT
  id, project_id, sprint_id, parent_id, title, description,
  CASE type WHEN 'task' THEN 'subtask' ELSE type END,
  status, priority, assignee_id, story_points, due_date, created_at, updated_at,
  labels, task_number, feature_branch, review_verdict, reviewed_commit,
  findings_url, run_stopped, risk, release_id
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX idx_tasks_project   ON tasks(project_id);
CREATE INDEX idx_tasks_sprint    ON tasks(sprint_id);
CREATE INDEX idx_tasks_status    ON tasks(status);
CREATE INDEX idx_tasks_assignee  ON tasks(assignee_id);
CREATE INDEX idx_tasks_release   ON tasks(release_id);
CREATE UNIQUE INDEX idx_tasks_project_number ON tasks(project_id, task_number);

PRAGMA foreign_keys = ON;
