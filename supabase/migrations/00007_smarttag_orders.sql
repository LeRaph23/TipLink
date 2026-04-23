-- ============================================================
-- SmartTag orders: tracks hardware fulfillment lifecycle.
-- Separate from subscription state on groups: one group can reorder.
-- ============================================================

CREATE TABLE IF NOT EXISTS smarttag_orders (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                      UUID        NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  pack                          TEXT        NOT NULL CHECK (pack IN ('s', 'm', 'l')),
  quantity                      INTEGER     NOT NULL CHECK (quantity > 0),
  stripe_checkout_session_id    TEXT        UNIQUE,
  stripe_invoice_id             TEXT,
  status                        TEXT        NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'pending_fulfillment', 'shipped', 'delivered', 'canceled')),
  shipping_address              JSONB,
  tracking_number               TEXT,
  shipped_at                    TIMESTAMPTZ,
  delivered_at                  TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS smarttag_orders_group_id_idx
  ON smarttag_orders (group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS smarttag_orders_status_idx
  ON smarttag_orders (status) WHERE status IN ('pending_fulfillment', 'pending_payment');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION smarttag_orders_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS smarttag_orders_updated_at_trg ON smarttag_orders;
CREATE TRIGGER smarttag_orders_updated_at_trg
  BEFORE UPDATE ON smarttag_orders
  FOR EACH ROW EXECUTE FUNCTION smarttag_orders_touch_updated_at();

-- ============================================================
-- Contact requests: enterprise lead form (no auth required to write,
-- but only service role reads; we expose via server action so we
-- gate at the application layer rather than anon RLS insert).
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  email        TEXT        NOT NULL,
  phone        TEXT,
  company      TEXT,
  team_size    TEXT,
  message      TEXT        NOT NULL,
  locale       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_requests_created_at_idx
  ON contact_requests (created_at DESC);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE smarttag_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;

-- Managers/admins of a group can see their own orders.
CREATE POLICY "smarttag_orders_select" ON smarttag_orders FOR SELECT USING (
  is_super_admin()
  OR group_id = ANY(get_my_group_ids())
  OR group_id IN (
    SELECT group_id FROM establishments
    WHERE id = ANY(get_my_managed_establishment_ids())
  )
);

-- INSERT/UPDATE only via service role (webhooks + admin ops). No user policy.

-- Contact requests: fully locked down for authenticated users.
-- Inserts happen via service role through /api/contact.
CREATE POLICY "contact_requests_deny_all" ON contact_requests FOR ALL USING (false);
