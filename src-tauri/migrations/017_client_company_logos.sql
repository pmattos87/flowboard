-- SF-134: Logos move from client projects to their clients, and the internal
-- company (the owner of every project with no client) gets a name and a logo.
--
-- In place, no table rebuild (see LESSONS.md, migration 003): ALTER, CREATE and
-- UPDATE only, so no row of `projects` or of its children is deleted or
-- rewritten through an FK action.
--
--   * clients.logo_data: a base64 data URL, NULL = no logo.
--   * company: one row (id 1), seeded 'Internal' so the sidebar reads as before
--     until it is renamed. Its own table, not a clients row: internal still
--     means `projects.client_id IS NULL` everywhere.
--   * Copy-up: each client takes the logo of its first project that HAS one
--     (by position, then id, archived projects included), so a project with
--     only the colored square never hides a sibling's real logo.
--   * Then every client project's own logo is cleared: a client project shows
--     no logo of its own from here on.

ALTER TABLE clients ADD COLUMN logo_data TEXT;

CREATE TABLE company (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  name      TEXT    NOT NULL,
  logo_data TEXT
);
INSERT INTO company (id, name, logo_data) VALUES (1, 'Internal', NULL);

UPDATE clients SET logo_data = (
  SELECT p.logo_data FROM projects p
   WHERE p.client_id = clients.id AND p.logo_data IS NOT NULL
   ORDER BY p.position, p.id
   LIMIT 1
);

UPDATE projects SET logo_data = NULL WHERE client_id IS NOT NULL;
