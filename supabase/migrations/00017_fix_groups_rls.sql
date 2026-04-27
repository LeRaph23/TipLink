-- Fix operator-precedence bug in groups_select policy.
-- The original policy:
--   is_super_admin() OR id = ANY(get_my_group_ids()) AND deleted_at IS NULL
-- evaluated as:
--   is_super_admin() OR (id = ANY(...) AND deleted_at IS NULL)
-- which allowed super-admins to read soft-deleted groups.
-- The correct form wraps the OR clause before applying AND deleted_at IS NULL.

DROP POLICY IF EXISTS "groups_select" ON groups;

CREATE POLICY "groups_select" ON groups FOR SELECT USING (
  (is_super_admin() OR id = ANY(get_my_group_ids()))
  AND deleted_at IS NULL
);
