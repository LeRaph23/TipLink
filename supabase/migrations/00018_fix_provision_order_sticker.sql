-- Fix logic bug in provision_order_sticker.
-- The original SELECT INTO v_establishment ... LIMIT 2 did NOT implement
-- "auto-assign only when the group has a single establishment". PL/pgSQL's
-- SELECT INTO silently takes the first row regardless of LIMIT, so groups
-- with multiple establishments had stickers wrongly attached to one of them.
-- Correct approach: use a conditional aggregate.

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

  -- Auto-attach to the establishment only when the group has exactly one.
  -- CASE WHEN COUNT(*)=1 ensures multi-establishment groups leave it NULL.
  SELECT CASE WHEN COUNT(*) = 1 THEN MIN(id) ELSE NULL END
  INTO v_establishment
  FROM establishments
  WHERE group_id = v_group_id AND deleted_at IS NULL;

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
