-- ============================================================
-- 00055 — Mangopay onboarding: SCA enrollment + nullable payout id
--
-- Withdrawals run as USER_NOT_PRESENT transfers, which require the staff /
-- ambassador to have completed a one-off SCA enrollment during onboarding.
-- `mangopay_sca_enrolled` records that consent.
--
-- A withdrawal has two legs (central->wallet Transfer, then wallet->Recipient
-- PayOut); the PayOut leg can fail after the Transfer leg succeeds, leaving a
-- staff_payouts row that carries only a transfer id — so the payout id must be
-- nullable.
-- ============================================================

ALTER TABLE staff_profiles
  ADD COLUMN mangopay_sca_enrolled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE ambassadors
  ADD COLUMN mangopay_sca_enrolled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE staff_payouts
  ALTER COLUMN mangopay_payout_id DROP NOT NULL;
