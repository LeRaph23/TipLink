-- Security hardening following the October 2026 audit.
--
-- 1. Column guards on groups / establishments / staff_profiles.
--    The UPDATE policies from 00002 scope *rows* but not *columns*: a group
--    admin holding the public anon key and their own session JWT could PATCH
--    /rest/v1/groups and set platform_fee_bps = 0, plan = 'pro', a foreign
--    stripe_customer_id…; a staff member (or a manager who assigned himself a
--    profile) could move a staff_profiles row into any other establishment,
--    because the WITH CHECK accepts `user_id = auth.uid()`.
--    Every legitimate write to those columns goes through the service role
--    (webhooks, server actions, admin pages), so the triggers below only bite
--    on PostgREST requests made as `anon` / `authenticated`. SECURITY DEFINER
--    functions run as their owner and are unaffected.
--
-- 2. Atomic PIN attempt registration for the ambassador / commercial portals
--    (the routes counted then inserted, so a burst of parallel guesses all saw
--    the same count and slipped past the cap).
--
-- 3. Payout reservation under a row lock, replacing the session-level advisory
--    locks of 00043 / 00057, which PostgREST's connection pool made unreliable
--    (taken on one pooled connection, "released" on another).
--
-- 4. Function privilege hygiene flagged by the Supabase security advisor.

-- ─── 1. Column guards ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_end_user_request()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  -- PostgREST switches to anon / authenticated for end-user requests. The
  -- service role, migrations and SECURITY DEFINER bodies run as other roles.
  SELECT current_user IN ('anon', 'authenticated') AND NOT public.is_super_admin();
$$;

CREATE OR REPLACE FUNCTION public.guard_groups_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.plan IS DISTINCT FROM OLD.plan
    OR NEW.platform_fee_bps IS DISTINCT FROM OLD.platform_fee_bps
    OR NEW.platform_fixed_fee_cents IS DISTINCT FROM OLD.platform_fixed_fee_cents
    OR NEW.pro_trial_started_at IS DISTINCT FROM OLD.pro_trial_started_at
    OR NEW.pro_trial_ends_at IS DISTINCT FROM OLD.pro_trial_ends_at
    OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
    OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
    OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
    OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
    OR NEW.subscription_current_period_end IS DISTINCT FROM OLD.subscription_current_period_end
    OR NEW.subscription_cancel_at IS DISTINCT FROM OLD.subscription_cancel_at
    OR NEW.terms_accepted_at IS DISTINCT FROM OLD.terms_accepted_at
    OR NEW.terms_version IS DISTINCT FROM OLD.terms_version
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'column is read-only for this role' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- terms_* are introduced here (filled by the onboarding server action through
-- the service role) so the guard above can reference them.
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version     text;

DROP TRIGGER IF EXISTS trg_guard_groups_columns ON public.groups;
CREATE TRIGGER trg_guard_groups_columns
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_groups_columns();

CREATE OR REPLACE FUNCTION public.guard_establishments_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- 00002 lets a group admin insert an establishment into his own group.
    -- Whatever he sends, Stripe state starts blank and the row is not a demo.
    NEW.stripe_account_id := NULL;
    NEW.stripe_charges_enabled := false;
    NEW.stripe_payouts_enabled := false;
    NEW.stripe_details_submitted := false;
    NEW.stripe_requirements := NULL;
    NEW.stripe_synced_at := NULL;
    NEW.is_demo := false;
    NEW.deleted_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.group_id IS DISTINCT FROM OLD.group_id
    OR NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
    OR NEW.stripe_charges_enabled IS DISTINCT FROM OLD.stripe_charges_enabled
    OR NEW.stripe_payouts_enabled IS DISTINCT FROM OLD.stripe_payouts_enabled
    OR NEW.stripe_details_submitted IS DISTINCT FROM OLD.stripe_details_submitted
    OR NEW.stripe_requirements IS DISTINCT FROM OLD.stripe_requirements
    OR NEW.stripe_synced_at IS DISTINCT FROM OLD.stripe_synced_at
    OR NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
    OR NEW.is_demo IS DISTINCT FROM OLD.is_demo
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'column is read-only for this role' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_establishments_columns ON public.establishments;
CREATE TRIGGER trg_guard_establishments_columns
  BEFORE INSERT OR UPDATE ON public.establishments
  FOR EACH ROW EXECUTE FUNCTION public.guard_establishments_columns();

CREATE OR REPLACE FUNCTION public.guard_staff_profiles_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  manages_old boolean;
BEGIN
  IF NOT public.is_end_user_request() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A manager may add a colleague to his own establishment (RLS checks
    -- that); payout plumbing always starts blank.
    NEW.stripe_account_id := NULL;
    NEW.onboarding_status := 'not_started';
    NEW.payouts_frozen := false;
    NEW.last_payout_failure_at := NULL;
    NEW.last_payout_failure_code := NULL;
    NEW.deleted_at := NULL;
    RETURN NEW;
  END IF;

  -- Never movable to another establishment, never re-pointed at another
  -- account, never touching payout state — whoever asks.
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.establishment_id IS DISTINCT FROM OLD.establishment_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
    OR NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
    OR NEW.payouts_frozen IS DISTINCT FROM OLD.payouts_frozen
    OR NEW.last_payout_failure_at IS DISTINCT FROM OLD.last_payout_failure_at
    OR NEW.last_payout_failure_code IS DISTINCT FROM OLD.last_payout_failure_code
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'column is read-only for this role' USING ERRCODE = '42501';
  END IF;

  -- Activation / removal belongs to whoever manages the establishment, not to
  -- the staff member himself (who could otherwise undo his own removal).
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
  THEN
    manages_old :=
      OLD.establishment_id = ANY(COALESCE(public.get_my_managed_establishment_ids(), '{}'))
      OR EXISTS (
        SELECT 1 FROM public.establishments e
        WHERE e.id = OLD.establishment_id
          AND e.group_id = ANY(COALESCE(public.get_my_group_ids(), '{}'))
      );
    IF NOT manages_old THEN
      RAISE EXCEPTION 'column is read-only for this role' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_staff_profiles_columns ON public.staff_profiles;
CREATE TRIGGER trg_guard_staff_profiles_columns
  BEFORE INSERT OR UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_staff_profiles_columns();

-- ─── 2. Atomic PIN attempt registration ──────────────────────────────────────
--
-- Records the attempt and returns the counts *including* it, under a
-- transaction-scoped advisory lock keyed on the portal + code, so concurrent
-- guesses on one code are serialized and each sees the previous ones.

CREATE OR REPLACE FUNCTION public.register_pin_attempt(
  p_portal      text,
  p_code        text,
  p_ip_hash     text,
  p_ip_window   interval,
  p_code_window interval
) RETURNS TABLE (ip_count bigint, code_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := lower(p_code);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pin:' || p_portal || ':' || v_code));

  IF p_portal = 'ambassador' THEN
    INSERT INTO public.ambassador_pin_attempts (ip_hash, code) VALUES (p_ip_hash, v_code);
    RETURN QUERY SELECT
      (SELECT count(*) FROM public.ambassador_pin_attempts
        WHERE ip_hash = p_ip_hash AND code = v_code AND attempted_at >= now() - p_ip_window),
      (SELECT count(*) FROM public.ambassador_pin_attempts
        WHERE code = v_code AND attempted_at >= now() - p_code_window);
  ELSIF p_portal = 'commercial' THEN
    INSERT INTO public.commercial_pin_attempts (ip_hash, code) VALUES (p_ip_hash, v_code);
    RETURN QUERY SELECT
      (SELECT count(*) FROM public.commercial_pin_attempts
        WHERE ip_hash = p_ip_hash AND code = v_code AND attempted_at >= now() - p_ip_window),
      (SELECT count(*) FROM public.commercial_pin_attempts
        WHERE code = v_code AND attempted_at >= now() - p_code_window);
  ELSE
    RAISE EXCEPTION 'unknown portal %', p_portal;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_pin_attempts_code_time
  ON public.ambassador_pin_attempts (code, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_commercial_pin_attempts_code_time
  ON public.commercial_pin_attempts (code, attempted_at DESC);

REVOKE ALL ON FUNCTION public.register_pin_attempt(text, text, text, interval, interval)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_pin_attempt(text, text, text, interval, interval)
  TO service_role;

-- ─── 3. Payout reservation ───────────────────────────────────────────────────
--
-- The route computes the withdrawable balance as earned − committed, where
-- committed = pending + paid + failed-with-a-transfer. It passes the committed
-- total it saw; the function locks the partner row, recomputes it, and only
-- inserts the pending payout when nothing moved in between. Any concurrent
-- request is serialized behind the row lock and then fails the comparison.

CREATE OR REPLACE FUNCTION public.reserve_partner_payout(
  p_kind               text,
  p_partner_id         uuid,
  p_amount_cents       integer,
  p_expected_committed bigint
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_committed bigint;
  v_id uuid;
BEGIN
  IF p_kind = 'ambassador' THEN
    PERFORM 1 FROM public.ambassadors WHERE id = p_partner_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'partner_not_found' USING ERRCODE = 'P0002'; END IF;
    SELECT COALESCE(sum(amount_cents), 0) INTO v_committed
      FROM public.ambassador_payouts
     WHERE ambassador_id = p_partner_id
       AND (status IN ('pending', 'paid') OR (status = 'failed' AND stripe_transfer_id IS NOT NULL));
    IF v_committed <> p_expected_committed THEN
      RAISE EXCEPTION 'stale_balance' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.ambassador_payouts (ambassador_id, amount_cents, status)
      VALUES (p_partner_id, p_amount_cents, 'pending')
      RETURNING id INTO v_id;
  ELSIF p_kind = 'commercial' THEN
    PERFORM 1 FROM public.commerciaux WHERE id = p_partner_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'partner_not_found' USING ERRCODE = 'P0002'; END IF;
    SELECT COALESCE(sum(amount_cents), 0) INTO v_committed
      FROM public.commercial_payouts
     WHERE commercial_id = p_partner_id
       AND (status IN ('pending', 'paid') OR (status = 'failed' AND stripe_transfer_id IS NOT NULL));
    IF v_committed <> p_expected_committed THEN
      RAISE EXCEPTION 'stale_balance' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.commercial_payouts (commercial_id, amount_cents, status)
      VALUES (p_partner_id, p_amount_cents, 'pending')
      RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'unknown kind %', p_kind;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_partner_payout(text, uuid, integer, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_partner_payout(text, uuid, integer, bigint)
  TO service_role;

-- The advisory-lock helpers are no longer called.
DROP FUNCTION IF EXISTS public.try_advisory_lock_payout(uuid);
DROP FUNCTION IF EXISTS public.release_advisory_lock_payout(uuid);
DROP FUNCTION IF EXISTS public.try_advisory_lock_commercial_payout(uuid);
DROP FUNCTION IF EXISTS public.release_advisory_lock_commercial_payout(uuid);

-- ─── 4. Function hygiene ─────────────────────────────────────────────────────
--
-- Pin search_path on every function the advisor flagged. Each one only
-- references public objects or schema-qualified auth.* helpers.
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.is_super_admin() SET search_path = public;
ALTER FUNCTION public.get_my_group_ids() SET search_path = public;
ALTER FUNCTION public.get_my_managed_establishment_ids() SET search_path = public;
ALTER FUNCTION public.get_my_staff_establishment_id() SET search_path = public;
ALTER FUNCTION public.get_my_staff_profile_id() SET search_path = public;
ALTER FUNCTION public.smarttag_orders_touch_updated_at() SET search_path = public;
ALTER FUNCTION public.get_establishment_report(uuid, timestamptz, timestamptz) SET search_path = public;
ALTER FUNCTION public.validate_unassigned_nfc_code(text) SET search_path = public;
ALTER FUNCTION public.touch_salon_visits_updated_at() SET search_path = public;
ALTER FUNCTION public.get_public_establishment_review(uuid) SET search_path = public;
ALTER FUNCTION public.get_public_staff(uuid) SET search_path = public;
ALTER FUNCTION public.get_public_group_staff(uuid) SET search_path = public;

-- Admin / maintenance functions guard themselves internally, but anon has no
-- business reaching them at all. (authenticated keeps EXECUTE where the admin
-- pages call them through the user's session.)
REVOKE EXECUTE ON FUNCTION public.admin_transactions_summary(text, uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.commercial_pilotage_summary() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_orphan_groups() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.provision_order_sticker(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_establishment_report(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
-- Triggers call it as the requesting role, so every API role must reach it.
GRANT EXECUTE ON FUNCTION public.is_end_user_request() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
