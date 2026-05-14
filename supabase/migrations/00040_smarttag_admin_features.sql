-- ── Race-proof tag reservation ─────────────────────────────────────────────
-- The PK (order_id, sticker_id) doesn't prevent the same sticker from being
-- reserved across two orders. The auto-assign filter is not transactional,
-- so two webhooks landing in parallel could each pick the same free tag.
-- A plain UNIQUE on sticker_id makes the second INSERT fail (-> webhook
-- throws, Stripe retries, the retry sees a smaller free pool and picks
-- different tags).
ALTER TABLE public.smarttag_order_tags
  ADD CONSTRAINT smarttag_order_tags_sticker_unique UNIQUE (sticker_id);

-- ── Internal notes ─────────────────────────────────────────────────────────
-- Free-form admin notes on the order (shipping quirks, ambassador context,
-- refund decisions, etc.). Never sent to the customer.
ALTER TABLE public.smarttag_orders
  ADD COLUMN IF NOT EXISTS internal_notes text;
