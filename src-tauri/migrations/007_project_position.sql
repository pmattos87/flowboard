-- Add a manual sort order to projects so the sidebar can be reordered by
-- drag & drop. Seed positions to match the previous default ordering
-- (created_at DESC) so existing projects keep their on-screen order.

ALTER TABLE projects ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn FROM projects
)
UPDATE projects SET position = (SELECT rn FROM ordered WHERE ordered.id = projects.id);
