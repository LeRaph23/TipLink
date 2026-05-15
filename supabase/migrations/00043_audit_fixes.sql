-- Audit fixes — see /root/.claude/plans/corrige-absolument-tout-ce-deep-pebble.md
-- Consolidates the schema/RLS/index changes needed by the security audit.

-- ─── 1. Atomic payout requests ────────────────────────────────────────────────
-- Prevent two pending payout requests for the same ambassador (double-payout race).
CREATE UNIQUE INDEX IF NOT EXISTS ambassador_payouts_one_pending_per_amb
  ON public.ambassador_payouts(ambassador_id)
  WHERE status = 'pending';

-- Advisory lock helpers used by /api/ambassadeur/[code]/payout to serialize
-- the compute → insert path even before the unique index would reject.
CREATE OR REPLACE FUNCTION public.try_advisory_lock_payout(p_ambassador_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acquired boolean;
BEGIN
  acquired := pg_try_advisory_lock(hashtext('payout:' || p_ambassador_id::text));
  RETURN acquired;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_advisory_lock_payout(p_ambassador_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_unlock(hashtext('payout:' || p_ambassador_id::text));
END;
$$;

REVOKE ALL ON FUNCTION public.try_advisory_lock_payout(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_advisory_lock_payout(uuid) FROM PUBLIC;

-- ─── 2. Atomic NFC sticker claim during onboarding ────────────────────────────
-- Replaces the SELECT … then UPDATE pattern with a single locked operation,
-- preventing two parallel onboardings from claiming the same sticker.
CREATE OR REPLACE FUNCTION public.claim_nfc_stickers(
  p_short_ids text[],
  p_establishment_id uuid
) RETURNS TABLE (id uuid, short_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH locked AS (
    SELECT s.id
      FROM public.nfc_stickers s
     WHERE lower(s.short_id) = ANY (
             SELECT lower(x) FROM unnest(p_short_ids) AS x
           )
       AND s.establishment_id IS NULL
       AND s.staff_id IS NULL
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.nfc_stickers ns
     SET establishment_id = p_establishment_id,
         updated_at = now()
    FROM locked
   WHERE ns.id = locked.id
  RETURNING ns.id, ns.short_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_nfc_stickers(text[], uuid) FROM PUBLIC;

-- ─── 3. Atomic promo code redemption ──────────────────────────────────────────
-- Replace the unconditional increment so that an attempt past max_redemptions
-- returns 0 rows updated; callers can detect the overflow and refuse.
CREATE OR REPLACE FUNCTION public.increment_promo_redeemed(promo_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE public.promo_codes
     SET times_redeemed = times_redeemed + 1
   WHERE id = promo_id
     AND is_active = true
     AND (max_redemptions IS NULL OR times_redeemed < max_redemptions)
  RETURNING times_redeemed INTO new_count;
  RETURN new_count; -- NULL if the code was full / inactive / unknown
END;
$$;

-- ─── 4. Dedup salon visits per ambassador per salon per day ───────────────────
-- A retry / double-click no longer creates a phantom visit; ambassador deliberately
-- re-visits the same salon next day will succeed.
CREATE UNIQUE INDEX IF NOT EXISTS salon_visits_unique_per_day
  ON public.salon_visits (ambassador_id, salon_id, ((visited_at AT TIME ZONE 'UTC')::date));

-- ─── 5. Indices on common soft-delete filters ─────────────────────────────────
-- The audit found 28 occurrences of WHERE deleted_at IS NULL with no covering
-- index. Add partial indexes on the hot tables.
CREATE INDEX IF NOT EXISTS idx_staff_profiles_active
  ON public.staff_profiles (establishment_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_establishments_active
  ON public.establishments (group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_groups_active
  ON public.groups (id) WHERE deleted_at IS NULL;

-- ─── 6. Staff profile uniqueness per (user, establishment) ────────────────────
-- Prevents the same user from claiming/owning two profiles in the same
-- establishment due to double-submit of the join form.
CREATE UNIQUE INDEX IF NOT EXISTS staff_profiles_unique_user_establishment
  ON public.staff_profiles (user_id, establishment_id)
  WHERE deleted_at IS NULL AND user_id IS NOT NULL;

-- ─── 7. group_tip_transfers — pending status & failure capture ────────────────
-- Enables the rows-first/Stripe-after pattern in the webhook so a crash in the
-- middle of the per-staff loop leaves recoverable state instead of orphan funds.
ALTER TABLE public.group_tip_transfers
  ALTER COLUMN stripe_transfer_id DROP NOT NULL;

ALTER TABLE public.group_tip_transfers
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed')),
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_gtt_pending
  ON public.group_tip_transfers (created_at)
  WHERE status IN ('pending', 'failed');

-- ─── 8. Salon timezone (used by lib/salon-hours.ts) ───────────────────────────
ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Paris';

-- ─── 9. Cold-email unsubscribe log (rate-limit dedup) ─────────────────────────
-- Used to enforce a one-time effect even if the link is hit by mail-scanners.
CREATE TABLE IF NOT EXISTS public.cold_email_unsubscribe_log (
  siret      text        PRIMARY KEY,
  unsubscribed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cold_email_unsubscribe_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ceul_super_admin_select" ON public.cold_email_unsubscribe_log
  FOR SELECT TO authenticated USING (public.is_super_admin());
