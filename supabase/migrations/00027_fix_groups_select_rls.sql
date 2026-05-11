-- Fix operator-precedence bug in groups_select RLS policy.
--
-- The original policy was:
--   is_super_admin() OR id = ANY(get_my_group_ids()) AND deleted_at IS NULL
--
-- In SQL, AND has higher precedence than OR, so that evaluated as:
--   is_super_admin() OR (id = ANY(get_my_group_ids()) AND deleted_at IS NULL)
--
-- This meant super_admins could SELECT soft-deleted groups.
-- The corrected policy applies deleted_at IS NULL to all callers.

DROP POLICY IF EXISTS "groups_select" ON groups;

CREATE POLICY "groups_select" ON groups FOR SELECT USING (
  deleted_at IS NULL
  AND (is_super_admin() OR id = ANY(get_my_group_ids()))
);
