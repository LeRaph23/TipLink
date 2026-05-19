-- ============================================================
-- 00053 — Stripe → Mangopay migration
--
-- Replaces all Stripe identifier columns with their Mangopay
-- equivalents. There is no production data to preserve, so dead
-- Stripe columns are dropped rather than kept.
--
-- NOTE: if a view or function depends on a dropped column, the
-- DROP COLUMN will fail; drop/recreate that object first.
-- ============================================================

-- --- staff_profiles ----------------------------------------------------------
ALTER TABLE staff_profiles
  DROP COLUMN IF EXISTS stripe_account_id,
  ADD COLUMN mangopay_user_id      TEXT,
  ADD COLUMN mangopay_wallet_id    TEXT,
  ADD COLUMN mangopay_recipient_id TEXT,
  ADD COLUMN mangopay_kyc_status   TEXT NOT NULL DEFAULT 'none'
    CHECK (mangopay_kyc_status IN ('none', 'pending', 'validated', 'refused'));

CREATE INDEX idx_staff_profiles_mangopay_user
  ON staff_profiles(mangopay_user_id);

-- --- ambassadors -------------------------------------------------------------
ALTER TABLE ambassadors
  DROP COLUMN IF EXISTS stripe_account_id,
  ADD COLUMN mangopay_user_id      TEXT,
  ADD COLUMN mangopay_wallet_id    TEXT,
  ADD COLUMN mangopay_recipient_id TEXT,
  ADD COLUMN mangopay_kyc_status   TEXT NOT NULL DEFAULT 'none'
    CHECK (mangopay_kyc_status IN ('none', 'pending', 'validated', 'refused'));

CREATE INDEX idx_ambassadors_mangopay_user
  ON ambassadors(mangopay_user_id);

-- --- establishments ----------------------------------------------------------
-- Establishments never receive a payout — no Mangopay replacement.
ALTER TABLE establishments
  DROP COLUMN IF EXISTS stripe_account_id;

-- --- groups ------------------------------------------------------------------
-- No "customer" concept in Mangopay; billing identity lives in
-- legal_name / vat_number / addresses.
ALTER TABLE groups
  DROP COLUMN IF EXISTS stripe_customer_id;

-- --- transactions ------------------------------------------------------------
ALTER TABLE transactions
  DROP COLUMN IF EXISTS stripe_payment_intent_id,
  DROP COLUMN IF EXISTS stripe_session_id,
  DROP COLUMN IF EXISTS stripe_charge_id,
  DROP COLUMN IF EXISTS stripe_transfer_id;

ALTER TABLE transactions RENAME COLUMN application_fee_amount TO platform_fee_amount;
ALTER TABLE transactions RENAME COLUMN dispute_id TO mangopay_dispute_id;

ALTER TABLE transactions
  ADD COLUMN mangopay_payin_id TEXT,
  ADD COLUMN mangopay_card_id  TEXT;

CREATE INDEX idx_transactions_mangopay_payin
  ON transactions(mangopay_payin_id);

-- --- group_tip_transfers -----------------------------------------------------
ALTER TABLE group_tip_transfers
  RENAME COLUMN stripe_transfer_id TO mangopay_transfer_id;

-- --- staff_payouts -----------------------------------------------------------
ALTER TABLE staff_payouts
  RENAME COLUMN stripe_payout_id TO mangopay_payout_id;

-- The central-wallet -> staff-wallet leg of the two-step withdrawal.
ALTER TABLE staff_payouts
  ADD COLUMN mangopay_transfer_id TEXT;

-- --- ambassador_payouts ------------------------------------------------------
ALTER TABLE ambassador_payouts
  RENAME COLUMN stripe_transfer_id TO mangopay_transfer_id;
ALTER TABLE ambassador_payouts
  RENAME COLUMN stripe_payout_id TO mangopay_payout_id;

-- --- smarttag_orders ---------------------------------------------------------
ALTER TABLE smarttag_orders
  DROP COLUMN IF EXISTS stripe_checkout_session_id,
  DROP COLUMN IF EXISTS stripe_payment_intent_id,
  DROP COLUMN IF EXISTS stripe_invoice_id,
  DROP COLUMN IF EXISTS stripe_discount_id,
  ADD COLUMN mangopay_payin_id TEXT,
  ADD COLUMN invoice_pdf_url   TEXT;

CREATE INDEX idx_smarttag_orders_mangopay_payin
  ON smarttag_orders(mangopay_payin_id);

-- --- promo_codes -------------------------------------------------------------
-- Discounts are computed in-app; no Stripe coupon objects to mirror.
ALTER TABLE promo_codes
  DROP COLUMN IF EXISTS stripe_coupon_id,
  DROP COLUMN IF EXISTS stripe_promo_code_id;

-- --- webhook_events ----------------------------------------------------------
-- Mangopay Hooks are unsigned GETs carrying only EventType + RessourceId.
-- Idempotency key becomes (resource_id, event_type). Dropping stripe_event_id
-- also drops its UNIQUE constraint and index.
ALTER TABLE webhook_events
  DROP COLUMN IF EXISTS stripe_event_id,
  ADD COLUMN mangopay_resource_id TEXT,
  ADD COLUMN mangopay_event_type  TEXT;

-- Hooks carry no payload; the handler refetches the resource instead.
ALTER TABLE webhook_events ALTER COLUMN payload DROP NOT NULL;

CREATE UNIQUE INDEX idx_webhook_events_mangopay_resource_event
  ON webhook_events(mangopay_resource_id, mangopay_event_type);
