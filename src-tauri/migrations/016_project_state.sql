-- FB-14 / FB-208: Archive a project. `state` is 'active' or 'archived'; every
-- existing project reads 'active'. Archiving is undone by setting it back.
--
-- ADD COLUMN only, no table rebuild (see LESSONS.md, migration 003): no row of
-- `projects` or of its children is deleted or rewritten through an FK action.

ALTER TABLE projects ADD COLUMN state TEXT NOT NULL DEFAULT 'active'
  CHECK (state IN ('active', 'archived'));
