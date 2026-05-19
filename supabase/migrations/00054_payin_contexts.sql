-- ============================================================
-- 00054 — payin_contexts: dispatch context for pack-purchase PayIns
--
-- A Mangopay PayIn carries no rich metadata (only a 255-char Tag), and
-- Hooks deliver just a RessourceId. Card tips already have a `transactions`
-- row keyed by mangopay_payin_id; SmartTag pack purchases used to keep their
-- context on the Stripe PaymentIntent's metadata, which has no Mangopay
-- equivalent.
--
-- This table records the full dispatch context, written before the PayIn is
-- created, so the webhook can resolve a PayIn id back to what it paid for
-- (pack, quantity, VAT breakdown, shipping, billing group, ...). The express
-- flow has no billing group until the webhook runs, so the context is stored
-- as an opaque JSON blob rather than as speculative group/order rows.
-- ============================================================

CREATE TABLE payin_contexts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Deterministic per checkout attempt; makes a retried submit reuse the row
  -- (and, via the Mangopay Idempotency-Key header, the same PayIn).
  idempotency_key   TEXT NOT NULL UNIQUE,
  source            TEXT NOT NULL CHECK (source IN ('pack-express', 'pack-order')),
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed')),
  mangopay_payin_id TEXT,
  context           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at      TIMESTAMPTZ
);

-- The webhook resolves a PayIn id (Hook RessourceId) to its context row.
CREATE INDEX idx_payin_contexts_mangopay_payin ON payin_contexts(mangopay_payin_id);

-- service_role only — never exposed to clients (mirrors webhook_events).
ALTER TABLE payin_contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payin_contexts_deny_all" ON payin_contexts FOR ALL USING (false);
