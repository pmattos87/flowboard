-- FB-99: labels are stored in one normalized form, written by
-- factory::ops::normalize_labels on every write from now on. This normalizes,
-- once, the rows written before that: each label trimmed of spaces, tabs, CR
-- and LF, empties dropped, exact duplicates removed, the rest sorted by
-- lower(label) and then by the exact text, joined with ",". lower() folds A-Z
-- only, as the Rust side does, so both give the same order for "Decisão".
-- Case and inner spaces are kept.
--
-- Data only: no table is rebuilt, updated_at is left alone (the labels mean the
-- same as before), and rows already in normal form are not written. Running the
-- statement again changes nothing.

WITH RECURSIVE
  split(id, part, rest) AS (
    SELECT id, '', labels || ',' FROM tasks
    UNION ALL
    SELECT id,
           trim(substr(rest, 1, instr(rest, ',') - 1), ' ' || char(9) || char(10) || char(13)),
           substr(rest, instr(rest, ',') + 1)
      FROM split
     WHERE rest <> ''
  ),
  norm(id, labels) AS (
    SELECT id,
           COALESCE(group_concat(part, ',' ORDER BY lower(part), part) FILTER (WHERE part <> ''), '')
      FROM (SELECT DISTINCT id, part FROM split)
     GROUP BY id
  )
UPDATE tasks
   SET labels = norm.labels
  FROM norm
 WHERE norm.id = tasks.id
   AND tasks.labels <> norm.labels;
