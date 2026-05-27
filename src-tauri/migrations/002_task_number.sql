-- Per-project task numbering: P1-1, P1-2, P2-1, ...
-- `tasks.id` remains the internal PK (FKs unchanged). `task_number` is the
-- user-facing sequence, scoped to project_id.

ALTER TABLE tasks ADD COLUMN task_number INTEGER NOT NULL DEFAULT 0;

UPDATE tasks
   SET task_number = (
     SELECT COUNT(*)
       FROM tasks AS t2
      WHERE t2.project_id = tasks.project_id
        AND t2.id <= tasks.id
   );

CREATE UNIQUE INDEX idx_tasks_project_number ON tasks(project_id, task_number);
