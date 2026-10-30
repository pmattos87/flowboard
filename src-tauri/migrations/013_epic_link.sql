-- FB-224: a Story's epic (an initiative grouping Stories by goal).
-- Additive only: one nullable column, no table rebuild (see LESSONS.md, migration 003).
-- Deleting the epic leaves its Stories in place with epic_id NULL.
ALTER TABLE tasks ADD COLUMN epic_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL;
