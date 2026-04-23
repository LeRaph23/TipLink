-- ============================================================
-- Fix: nfc_stickers_update had WITH CHECK (true), allowing a
-- manager to reassign a sticker to ANY staff_id (including
-- staff outside their scope). This migration tightens the
-- WITH CHECK to mirror USING *and* validate the target
-- staff_id belongs to the caller's scope.
-- ============================================================

DROP POLICY IF EXISTS "nfc_stickers_update" ON nfc_stickers;

CREATE POLICY "nfc_stickers_update" ON nfc_stickers FOR UPDATE
  USING (
    is_super_admin()
    OR establishment_id = ANY(get_my_managed_establishment_ids())
    OR establishment_id = ANY(
      SELECT id FROM establishments WHERE group_id = ANY(get_my_group_ids())
    )
    OR staff_id IN (
      SELECT id FROM staff_profiles
      WHERE establishment_id = ANY(get_my_managed_establishment_ids())
    )
  )
  WITH CHECK (
    (
      is_super_admin()
      OR establishment_id = ANY(get_my_managed_establishment_ids())
      OR establishment_id = ANY(
        SELECT id FROM establishments WHERE group_id = ANY(get_my_group_ids())
      )
      OR staff_id IN (
        SELECT id FROM staff_profiles
        WHERE establishment_id = ANY(get_my_managed_establishment_ids())
      )
    )
    AND (
      staff_id IS NULL
      OR is_super_admin()
      OR staff_id IN (
        SELECT id FROM staff_profiles
        WHERE establishment_id = ANY(get_my_managed_establishment_ids())
           OR establishment_id = ANY(
             SELECT id FROM establishments WHERE group_id = ANY(get_my_group_ids())
           )
      )
    )
  );
