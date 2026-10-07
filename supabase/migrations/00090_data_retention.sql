-- ============================================================
-- Data retention, enforced
--
-- The privacy policy (section 5) states how long each kind of data is kept.
-- Until now nothing deleted anything, so the promise was only words. This
-- function applies every duration in one place, run daily by
-- /api/cron/data-retention with the service role.
--
-- Each line below names the policy promise it keeps. Durations are counted
-- from the last moment the data was useful (account closure, last contact,
-- end of contract), never from creation alone, except where the data has no
-- later event.
--
-- What it does not touch, on purpose:
--   - transactions, tip_allocations, payouts and invoices less than 10 years
--     old: accounting records (Code de commerce L123-22, LPF L102 B);
--   - the business identity of a closed group (name, legal name), which those
--     records point to;
--   - partner contracts (5 years after they end): each carries a signature
--     image in Storage, which SQL must not delete, so that purge stays manual.
--     None reaches 5 years before 2030.
-- ============================================================

-- ── 1. An unsubscribed prospect can never be re-imported ─────────────────────
-- The policy says prospection data is deleted as soon as someone unsubscribes.
-- Deleting the prospect row would let the next SIRENE import create it again
-- and email them, so the SIRET stays in cold_email_unsubscribe_log (the
-- minimum needed to honour the objection, as the CNIL allows) and this trigger
-- turns any later insert of that SIRET into a no-op. Upserts with
-- ignoreDuplicates then simply skip the row.
CREATE OR REPLACE FUNCTION public.skip_unsubscribed_prospect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.siret IS NOT NULL
     AND EXISTS (SELECT 1 FROM cold_email_unsubscribe_log l WHERE l.siret = NEW.siret) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.skip_unsubscribed_prospect() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cold_email_prospects_skip_unsubscribed ON public.cold_email_prospects;
CREATE TRIGGER cold_email_prospects_skip_unsubscribed
  BEFORE INSERT ON public.cold_email_prospects
  FOR EACH ROW EXECUTE FUNCTION public.skip_unsubscribed_prospect();

-- ── 2. The retention pass ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_data_retention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
  removed jsonb := '{}'::jsonb;
BEGIN
  -- Prospection: deleted on unsubscribe (the SIRET stays in the suppression
  -- log, see above), and 3 years after the last contact otherwise.
  DELETE FROM cold_email_prospects WHERE unsubscribed_at IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('prospects_unsubscribed', n);

  DELETE FROM cold_email_prospects
  WHERE GREATEST(imported_at, last_sent_at, replied_at, clicked_landing_at) < now() - interval '3 years';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('prospects_stale', n);

  -- Canvassing notes about a salon: prospection data, 3 years after the visit.
  DELETE FROM salon_visits WHERE GREATEST(visited_at, follow_up_at, updated_at) < now() - interval '3 years';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('salon_visits', n);

  -- Contact form: 3 years after the request.
  DELETE FROM contact_requests WHERE created_at < now() - interval '3 years';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('contact_requests', n);

  -- Partner applications not taken up: 2 years after the last exchange.
  -- Accepted ones are part of the partner's file, kept with the contract.
  DELETE FROM ambassador_recruitment_applications
  WHERE status <> 'accepted'
    AND GREATEST(created_at, reviewed_at, last_reminder_at) < now() - interval '2 years';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('ambassador_applications', n);

  DELETE FROM commercial_recruitment_applications
  WHERE COALESCE(status, '') <> 'accepted'
    AND GREATEST(created_at, reviewed_at) < now() - interval '2 years';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('commercial_applications', n);

  -- Compliments and review clicks: deleted with the establishment's account.
  DELETE FROM tip_compliments c
  USING establishments e JOIN groups g ON g.id = e.group_id
  WHERE e.id = c.establishment_id AND (e.deleted_at IS NOT NULL OR g.deleted_at IS NOT NULL);
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('compliments', n);

  DELETE FROM review_clicks r
  USING establishments e JOIN groups g ON g.id = e.group_id
  WHERE e.id = r.establishment_id AND (e.deleted_at IS NOT NULL OR g.deleted_at IS NOT NULL);
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('review_clicks', n);

  -- Account data: kept while the account is active, then 3 years.
  -- A departed staff member keeps a row (their tips point to it) but loses
  -- their name and photo.
  UPDATE staff_profiles
  SET full_name = 'Ancien membre', avatar_url = NULL, user_id = NULL
  WHERE deleted_at < now() - interval '3 years'
    AND (full_name <> 'Ancien membre' OR avatar_url IS NOT NULL OR user_id IS NOT NULL);
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('staff_anonymised', n);

  -- A closed group keeps its business identity (accounting) and loses its
  -- contacts and addresses.
  UPDATE groups
  SET accountant_email = NULL, billing_address = NULL, shipping_address = NULL, logo_url = NULL
  WHERE deleted_at < now() - interval '3 years'
    AND (accountant_email IS NOT NULL OR billing_address IS NOT NULL
         OR shipping_address IS NOT NULL OR logo_url IS NOT NULL);
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('groups_anonymised', n);

  -- Login accounts with nothing left behind them for 3 years: no role on a
  -- live group or establishment, no live staff profile, no sign-in. Never a
  -- super admin. user_roles cascade; staff_profiles.user_id is set null.
  DELETE FROM auth.users u
  WHERE COALESCE(u.last_sign_in_at, u.created_at) < now() - interval '3 years'
    AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'super_admin')
    AND NOT EXISTS (
      SELECT 1 FROM user_roles r
      LEFT JOIN groups g ON g.id = r.group_id
      LEFT JOIN establishments e ON e.id = r.establishment_id
      WHERE r.user_id = u.id
        AND ((g.id IS NOT NULL AND (g.deleted_at IS NULL OR g.deleted_at > now() - interval '3 years'))
          OR (e.id IS NOT NULL AND (e.deleted_at IS NULL OR e.deleted_at > now() - interval '3 years')))
    )
    AND NOT EXISTS (
      SELECT 1 FROM staff_profiles s
      WHERE s.user_id = u.id AND (s.deleted_at IS NULL OR s.deleted_at > now() - interval '3 years')
    );
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('auth_users', n);

  -- Accounting records: 10 years, then deleted. Allocations, compliments and
  -- clicks cascade; negative balance events do not, so they go first.
  DELETE FROM negative_balance_events nb
  USING transactions t
  WHERE t.id = nb.transaction_id AND t.created_at < now() - interval '10 years';

  DELETE FROM transactions WHERE created_at < now() - interval '10 years';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('transactions', n);

  -- Email logs (addresses of people written to): 3 years.
  DELETE FROM lifecycle_email_log WHERE created_at < now() - interval '3 years';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('lifecycle_email_log', n);

  DELETE FROM referral_email_log WHERE sent_at < now() - interval '3 years';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('referral_email_log', n);

  DELETE FROM ambassador_email_logs WHERE sent_at < now() - interval '3 years';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('ambassador_email_logs', n);

  -- Technical data. Stripe events (they carry customers' emails) are only
  -- needed to deduplicate retries, which Stripe stops after 3 days: 90 days.
  DELETE FROM webhook_events WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('webhook_events', n);

  -- PIN attempts (hashed IP) only serve the brute-force limit: 30 days.
  DELETE FROM ambassador_pin_attempts WHERE attempted_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('ambassador_pin_attempts', n);

  DELETE FROM commercial_pin_attempts WHERE attempted_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('commercial_pin_attempts', n);

  -- Admin action log: 3 years.
  DELETE FROM admin_audit_log WHERE created_at < now() - interval '3 years';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed || jsonb_build_object('admin_audit_log', n);

  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_data_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_data_retention() TO service_role;
