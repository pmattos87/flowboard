-- FB-202 / FB-203: Clients. A client is an organization; a project is one
-- solution for a client (or internal, with no client).
--
-- In place, no table rebuild (see LESSONS.md, migration 003): `projects` is
-- only ALTERed, so no row of it or of its children is deleted or rewritten
-- through an FK action. FK enforcement is off at connect time (db::init_pool).
--
--   * clients: name and sidebar position only (no color or logo yet).
--   * projects.client_id: NULL means internal. Deleting a client leaves its
--     projects in place as internal.
--   * projects.kind is dropped: it is derived from client_id now (client iff
--     set) and computed in the API responses. It was added by migration 010
--     with ADD COLUMN and only a column-level CHECK (no index, view, trigger
--     or table CHECK names it), so DROP COLUMN works in place.
--   * Contacts move from the project to its client: project_contacts (no rows
--     in the live DB, nothing references it) is replaced by client_contacts.

CREATE TABLE clients (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT    NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE projects ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE projects DROP COLUMN kind;

-- Client contacts are existing people linked to a client; one may be primary
-- (the assignee of a Story in user_testing on any of the client's projects).
CREATE TABLE client_contacts (
  client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  person_id  INTEGER NOT NULL REFERENCES people(id)  ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, person_id)
);
CREATE UNIQUE INDEX idx_client_contacts_primary ON client_contacts(client_id)
  WHERE is_primary = 1;

DROP TABLE project_contacts;
