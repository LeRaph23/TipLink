-- ============================================================
-- Admin fulfillment flow: the TipLink super_admin assigns stock
-- SmartTags to establishments from the web dashboard (no mobile
-- encoding app anymore). Drop the obsolete RPC and open the
-- relevant tables to super_admin writes via RLS.
-- ============================================================

DROP FUNCTION IF EXISTS public.provision_order_sticker(UUID);

-- smarttag_orders: super_admin can UPDATE status / tracking /
-- tags_encoded_count from the admin dashboard.
DROP POLICY IF EXISTS "smarttag_orders_update" ON smarttag_orders;
CREATE POLICY "smarttag_orders_update" ON smarttag_orders FOR UPDATE
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- smarttag_order_tags: super_admin can INSERT (link a sticker to
-- an order when fulfilling) and DELETE (unlink if needed).
DROP POLICY IF EXISTS "smarttag_order_tags_insert" ON smarttag_order_tags;
CREATE POLICY "smarttag_order_tags_insert" ON smarttag_order_tags FOR INSERT
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "smarttag_order_tags_delete" ON smarttag_order_tags;
CREATE POLICY "smarttag_order_tags_delete" ON smarttag_order_tags FOR DELETE
  USING (is_super_admin());

NOTIFY pgrst, 'reload schema';
