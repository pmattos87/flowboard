-- Add an optional profile photo, stored as a base64 data URL.
-- NULL = no photo (fall back to the colored initials avatar).
-- Plain ADD COLUMN: no table rebuild, so FK cascade actions are not triggered.
ALTER TABLE people ADD COLUMN avatar_data TEXT;
