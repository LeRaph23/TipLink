-- ============================================================
-- Encoding progress for SmartTag orders: tracks how many tags
-- have been encoded by the admin mobile app, and links each
-- encoded nfc_sticker back to the order it fulfilled.
-- ============================================================

ALTER TABLE smarttag_orders
  ADD COLUMN IF NOT EXISTS tags_encoded_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fulfilled_at       TIMESTAMPTZ;

-- Add a richer status for "ready to ship" state between paid and shipped.
ALTER TABLE smarttag_orders
  DROP CONSTRAINT IF EXISTS smarttag_orders_status_check;

ALTER TABLE smarttag_orders
  ADD CONSTRAINT smarttag_orders_status_check
  CHECK (status IN (
    'pending_payment',
    'pending_fulfillment',
    'encoding',
    'ready_to_ship',
    'shipped',
    'delivered',
    'canceled'
  ));

CREATE TABLE IF NOT EXISTS smarttag_order_tags (
  order_id    UUID NOT NULL REFERENCES smarttag_orders(id) ON DELETE CASCADE,
  sticker_id  UUID NOT NULL REFERENCES nfc_stickers(id)   ON DELETE CASCADE,
  encoded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, sticker_id)
);

CREATE INDEX IF NOT EXISTS smarttag_order_tags_order_idx
  ON smarttag_order_tags (order_id, encoded_at DESC);
CREATE INDEX IF NOT EXISTS smarttag_order_tags_sticker_idx
  ON smarttag_order_tags (sticker_id);

ALTER TABLE smarttag_order_tags ENABLE ROW LEVEL SECURITY;

-- Only super admins read this table (it's an admin-only encoding log).
CREATE POLICY "smarttag_order_tags_select" ON smarttag_order_tags
  FOR SELECT USING (is_super_admin());

-- No user-facing insert/update policy: encoding is done server-side with service role.

-- ============================================================
-- provisionOrderSticker: atomically creates a sticker for a given
-- order, links it, increments tags_encoded_count. Must be called
-- with service_role (from mobile app via secure endpoint) or by
-- a super admin.
-- ============================================================
CREATE OR REPLACE FUNCTION public.provision_order_sticker(p_order_id UUID)
RETURNS TABLE (sticker_id UUID, short_id TEXT, encoded_count INT, total_quantity INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order           smarttag_orders%ROWTYPE;
  v_group_id        UUID;
  v_establishment   UUID;
  v_sticker_id      UUID;
  v_short_id        TEXT;
  v_new_count       INT;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_order FROM smarttag_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_order.tags_encoded_count >= v_order.quantity THEN
    RAISE EXCEPTION 'order_already_fully_encoded';
  END IF;

  v_group_id := v_order.group_id;

  -- If the group has a single establishment, auto-attach the sticker to it.
  SELECT id INTO v_establishment
  FROM establishments
  WHERE group_id = v_group_id AND deleted_at IS NULL
  LIMIT 2;

  -- Generate short_id (8 chars alphanumeric).
  v_short_id := lower(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  INSERT INTO nfc_stickers (short_id, establishment_id)
  VALUES (v_short_id, v_establishment)
  RETURNING id INTO v_sticker_id;

  INSERT INTO smarttag_order_tags (order_id, sticker_id)
  VALUES (p_order_id, v_sticker_id);

  v_new_count := v_order.tags_encoded_count + 1;

  UPDATE smarttag_orders
  SET tags_encoded_count = v_new_count,
      status = CASE
        WHEN v_new_count >= quantity THEN 'ready_to_ship'
        ELSE 'encoding'
      END,
      fulfilled_at = CASE
        WHEN v_new_count >= quantity THEN now()
        ELSE fulfilled_at
      END
  WHERE id = p_order_id;

  sticker_id     := v_sticker_id;
  short_id       := v_short_id;
  encoded_count  := v_new_count;
  total_quantity := v_order.quantity;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provision_order_sticker(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_order_sticker(UUID) TO service_role;
