-- Store attachment file bytes inside the database so attachments travel with
-- the .db file (self-contained, visible to anyone who has the database).
-- Additive only: existing rows keep their data; `content` is NULL for any
-- legacy path-only attachment, which the open path falls back to gracefully.
ALTER TABLE attachments ADD COLUMN content BLOB;
ALTER TABLE attachments ADD COLUMN mime_type TEXT NOT NULL DEFAULT '';
