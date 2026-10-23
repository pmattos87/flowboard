-- SF-68: a Factory Story's story_points are the sum of its Subtasks' points,
-- kept by factory::ops from now on. This backfills, once, the Stories split
-- before that: each Factory Story still at 0 gets the sum of its non-bug,
-- non-canceled Subtasks. Stories with no Subtasks stay at 0, Stories that
-- already have points keep them, and legacy projects are untouched.
--
-- Data only: no table is rebuilt.

UPDATE tasks
   SET story_points = (
         SELECT COALESCE(SUM(c.story_points), 0) FROM tasks c
          WHERE c.parent_id = tasks.id AND c.type <> 'bug' AND c.status <> 'canceled')
 WHERE type = 'story'
   AND story_points = 0
   AND project_id IN (SELECT id FROM projects WHERE ladder = 'factory');
