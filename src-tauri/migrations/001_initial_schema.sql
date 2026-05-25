PRAGMA foreign_keys = ON;

CREATE TABLE projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  key         TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  color       TEXT    NOT NULL DEFAULT '#6366f1',
  created_at  TEXT    NOT NULL
);

CREATE TABLE people (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  email        TEXT    NOT NULL,
  avatar_color TEXT    NOT NULL DEFAULT '#6366f1',
  role         TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE sprints (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  goal       TEXT    NOT NULL DEFAULT '',
  start_date TEXT    NOT NULL,
  end_date   TEXT    NOT NULL,
  status     TEXT    NOT NULL CHECK (status IN ('backlog','active','completed')) DEFAULT 'backlog'
);

CREATE TABLE tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sprint_id    INTEGER          REFERENCES sprints(id)  ON DELETE SET NULL,
  parent_id    INTEGER          REFERENCES tasks(id)    ON DELETE SET NULL,
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  type         TEXT    NOT NULL CHECK (type IN ('story','bug','task','epic'))               DEFAULT 'task',
  status       TEXT    NOT NULL CHECK (status IN ('todo','in_progress','in_review','done')) DEFAULT 'todo',
  priority     TEXT    NOT NULL CHECK (priority IN ('low','medium','high','critical'))      DEFAULT 'medium',
  assignee_id  INTEGER          REFERENCES people(id)   ON DELETE SET NULL,
  story_points INTEGER NOT NULL DEFAULT 0,
  due_date     TEXT,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL,
  labels       TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id)  ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);

CREATE TABLE time_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id)  ON DELETE CASCADE,
  person_id  INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  minutes    INTEGER NOT NULL,
  logged_at  TEXT    NOT NULL,
  note       TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  filename    TEXT    NOT NULL,
  filepath    TEXT    NOT NULL,
  size        INTEGER NOT NULL,
  uploaded_at TEXT    NOT NULL
);

CREATE TABLE activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id)  ON DELETE CASCADE,
  person_id  INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  action     TEXT    NOT NULL,
  old_value  TEXT    NOT NULL DEFAULT '',
  new_value  TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL
);

CREATE INDEX idx_tasks_project      ON tasks(project_id);
CREATE INDEX idx_tasks_sprint       ON tasks(sprint_id);
CREATE INDEX idx_tasks_status       ON tasks(status);
CREATE INDEX idx_tasks_assignee     ON tasks(assignee_id);
CREATE INDEX idx_sprints_project    ON sprints(project_id);
CREATE INDEX idx_comments_task      ON comments(task_id);
CREATE INDEX idx_time_logs_task     ON time_logs(task_id);
CREATE INDEX idx_attachments_task   ON attachments(task_id);
CREATE INDEX idx_activity_log_task  ON activity_log(task_id);
