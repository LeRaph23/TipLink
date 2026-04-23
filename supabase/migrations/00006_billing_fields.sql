-- ============================================================
-- Billing fields on groups: company details + Stripe subscription state.
-- Rationale: groups are the billing entity. Staff ≠ billing customer.
-- ============================================================

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS legal_name          TEXT,
  ADD COLUMN IF NOT EXISTS vat_number          TEXT,
  ADD COLUMN IF NOT EXISTS billing_address     JSONB,
  ADD COLUMN IF NOT EXISTS shipping_address    JSONB,
  ADD COLUMN IF NOT EXISTS stripe_customer_id  TEXT,
  ADD COLUMN IF NOT EXISTS subscription_id     TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS subscription_pack   TEXT
    CHECK (subscription_pack IS NULL OR subscription_pack IN ('s', 'm', 'l'));

-- One Stripe customer per group. NULL allowed (not all groups are paying yet).
CREATE UNIQUE INDEX IF NOT EXISTS groups_stripe_customer_id_key
  ON groups (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS groups_subscription_id_key
  ON groups (subscription_id)
  WHERE subscription_id IS NOT NULL;

-- Index for webhook lookup by Stripe IDs
CREATE INDEX IF NOT EXISTS groups_stripe_customer_id_idx
  ON groups (stripe_customer_id);
