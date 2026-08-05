-- FB-46: track when a comment was last edited. NULL means "never edited",
-- which is what every existing row gets.
--
-- Plain ADD COLUMN — no table rebuild. Rebuilding would drop and recreate
-- `comments`, and a DROP TABLE inside the migration fires ON DELETE CASCADE on
-- the way out (see LESSONS.md, FB-36). Nothing here needs a rebuild: the column
-- is nullable with no CHECK constraint to alter.

ALTER TABLE comments ADD COLUMN updated_at TEXT;
