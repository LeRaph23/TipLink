-- ============================================================
-- SmartTags: establishment-scoped (nullable = "in stock").
--
-- Product model:
--   * A SmartTag belongs to at most ONE establishment.
--   * NULL establishment_id means "in stock at TipLink, not yet
--     shipped/assigned". Only super_admin sees stock tags.
--   * Provisioning (INSERT/UPDATE/DELETE) is super_admin only.
--   * Customers who scan an unassigned (stock) tag get 404 — the
--     middleware already treats NULL as not-found.
--
-- Previously nfc_stickers could point to either staff_id OR
-- establishment_id. We drop staff_id entirely; the customer picks
-- their tipped staff member at pay time via /pay/group/[est_id].
-- ============================================================

-- 1) Drop the XOR constraint first so we can freely set both columns
--    during backfill (we'll drop staff_id right after).
DROP POLICY IF EXISTS "nfc_stickers_select" ON nfc_stickers;
DROP POLICY IF EXISTS "nfc_stickers_insert" ON nfc_stickers;
DROP POLICY IF EXISTS "nfc_stickers_update" ON nfc_stickers;
DROP POLICY IF EXISTS "nfc_stickers_delete" ON nfc_stickers;

ALTER TABLE nfc_stickers DROP CONSTRAINT IF EXISTS nfc_stickers_target_check;

-- 2) Backfill: copy the staff's establishment into any sticker
--    currently pointed at a staff member.
UPDATE nfc_stickers s
SET establishment_id = sp.establishment_id
FROM staff_profiles sp
WHERE s.staff_id = sp.id
  AND s.establishment_id IS NULL;

DROP INDEX IF EXISTS idx_nfc_stickers_staff_id;
ALTER TABLE nfc_stickers DROP COLUMN IF EXISTS staff_id;

-- 3) New columns for factory batch traceability.
ALTER TABLE nfc_stickers
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS batch_label  TEXT;

CREATE INDEX IF NOT EXISTS idx_nfc_stickers_batch_label
  ON nfc_stickers(batch_label) WHERE batch_label IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nfc_stickers_establishment_id
  ON nfc_stickers(establishment_id) WHERE establishment_id IS NOT NULL;

-- 4) New RLS policies.
--    SELECT:
--      * super_admin: everything (incl. stock / NULL establishment)
--      * everyone else: only rows with a non-null establishment_id
--        that is in their scope.
--    INSERT/UPDATE/DELETE: super_admin only. Manual provisioning
--    by TipLink staff.

CREATE POLICY "nfc_stickers_select" ON nfc_stickers FOR SELECT USING (
  is_super_admin()
  OR (
    establishment_id IS NOT NULL
    AND (
      establishment_id = ANY(get_my_managed_establishment_ids())
      OR establishment_id = ANY(
        SELECT id FROM establishments WHERE group_id = ANY(get_my_group_ids())
      )
      OR establishment_id = (
        SELECT establishment_id FROM staff_profiles
        WHERE id = get_my_staff_profile_id()
      )
    )
  )
);

CREATE POLICY "nfc_stickers_insert" ON nfc_stickers FOR INSERT
  WITH CHECK (is_super_admin());

CREATE POLICY "nfc_stickers_update" ON nfc_stickers FOR UPDATE
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "nfc_stickers_delete" ON nfc_stickers FOR DELETE
  USING (is_super_admin());

-- 5) Force PostgREST schema reload so the dropped column
--    disappears from the generated types.
NOTIFY pgrst, 'reload schema';
