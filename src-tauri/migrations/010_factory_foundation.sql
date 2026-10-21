-- SF-2 / Software Factory phase 1: additive schema for Factory projects.
--
-- Everything here is additive. Legacy projects keep their statuses, rows and
-- ids; every new column has a default (or is nullable) and existing rows get it.
--
-- New on tasks (requires a rebuild, since SQLite cannot ALTER a CHECK):
--   * statuses backlog, ready, building, integrated_tests, tested, user_testing
--     (the Factory Story ladder; refining/done/canceled are reused, and the
--     Subtask ladder reuses todo/in_progress/done/canceled)
--   * Story fields: feature_branch, review_verdict, reviewed_commit,
--     findings_url, run_stopped, release_id
--   * Subtask field: risk
-- New elsewhere: projects.ladder + projects.kind, people.factory_role, and the
-- releases, project_contacts, task_links and task_prs tables.
--
-- foreign_keys MUST be OFF for the rebuild: DROP TABLE on a parent performs an
-- implicit DELETE that fires ON DELETE CASCADE/SET NULL on the child tables
-- (comments, time_logs, attachments, activity_log) and on tasks.parent_id. FK
-- enforcement is disabled at connect time by db::init_pool (the in-SQL PRAGMA
-- below is a no-op inside sqlx's migration transaction — see LESSONS.md FB-36).

PRAGMA foreign_keys = OFF;

ALTER TABLE projects ADD COLUMN ladder TEXT NOT NULL DEFAULT 'legacy'
  CHECK (ladder IN ('legacy','factory'));
ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'internal'
  CHECK (kind IN ('internal','client'));

-- Which person the Factory assigns as "Pedro" (owner) and as "Agent". At most
-- one of each; everyone else stays NULL.
ALTER TABLE people ADD COLUMN factory_role TEXT
  CHECK (factory_role IN ('owner','agent'));
CREATE UNIQUE INDEX idx_people_factory_role ON people(factory_role)
  WHERE factory_role IS NOT NULL;

CREATE TABLE releases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version     TEXT    NOT NULL,
  state       TEXT    NOT NULL DEFAULT 'planned'
              CHECK (state IN ('planned','user_testing','released','canceled')),
  created_at  TEXT    NOT NULL,
  released_at TEXT,
  UNIQUE (project_id, version)
);

CREATE TABLE tasks_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sprint_id       INTEGER          REFERENCES sprints(id)  ON DELETE SET NULL,
  parent_id       INTEGER          REFERENCES tasks(id)    ON DELETE SET NULL,
  title           TEXT    NOT NULL,
  description     TEXT    NOT NULL DEFAULT '',
  type            TEXT    NOT NULL CHECK (type IN ('story','bug','task','epic')) DEFAULT 'task',
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
CREATE INDEX idx_tasks_release   ON tasks(release_id);
CREATE UNIQUE INDEX idx_tasks_project_number ON tasks(project_id, task_number);

-- Client contacts are existing people linked to a project; one may be primary
-- (the assignee of a Story in user_testing).
CREATE TABLE project_contacts (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id  INTEGER NOT NULL REFERENCES people(id)   ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, person_id)
);
CREATE UNIQUE INDEX idx_project_contacts_primary ON project_contacts(project_id)
  WHERE is_primary = 1;

-- Story depends-on links (used only to warn when picking a Release).
CREATE TABLE task_links (
  task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at    TEXT    NOT NULL,
  PRIMARY KEY (task_id, depends_on_id),
  CHECK (task_id <> depends_on_id)
);

CREATE TABLE task_prs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  url        TEXT    NOT NULL,
  target     TEXT    NOT NULL DEFAULT '',
  state      TEXT    NOT NULL DEFAULT 'open' CHECK (state IN ('open','merged','closed')),
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  UNIQUE (task_id, url)
);

PRAGMA foreign_keys = ON;
