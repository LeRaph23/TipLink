-- 00049: Lifecycle / automated email system.
--
-- Personalized onboarding, activation, retention and alert emails for group
-- admins and staff, sent by the daily cron (/api/cron/lifecycle-emails) and
-- inline from the Stripe webhook. `lifecycle_email_log` is BOTH the audit trail
-- AND the idempotency + frequency-cap store: every send is claimed here first.

CREATE TABLE IF NOT EXISTS public.lifecycle_email_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email_key        text        NOT NULL,
  audience         text        NOT NULL CHECK (audience IN ('group_admin','staff')),
  transactional    boolean     NOT NULL DEFAULT false,
  -- The subject the email is about (one or more set depending on scope).
  group_id         uuid        REFERENCES public.groups(id)          ON DELETE CASCADE,
  establishment_id uuid        REFERENCES public.establishments(id)  ON DELETE CASCADE,
  staff_id         uuid        REFERENCES public.staff_profiles(id)  ON DELETE CASCADE,
  to_email         text        NOT NULL,
  locale           text        NOT NULL DEFAULT 'fr',
  -- Deterministic per (email_key, subject, occurrence/period) — see lib/email/lifecycle.ts.
  dedup_key        text        NOT NULL,
  resend_id        text,
  status           text        NOT NULL CHECK (status IN ('pending','sent','skipped','failed')),
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz
);

-- Exactly-once guarantee + race-safe claim: a row is INSERTed as 'pending'
-- BEFORE the Resend call; a unique violation means "already handled, skip".
-- 'failed' is excluded so a transient Resend error is retried on the next run.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lifecycle_email_dedup
  ON public.lifecycle_email_log (dedup_key)
  WHERE status IN ('pending','sent');

-- Frequency-cap lookups: "any non-transactional email to this recipient lately?"
CREATE INDEX IF NOT EXISTS idx_lifecycle_email_log_group
  ON public.lifecycle_email_log (group_id, sent_at DESC)
  WHERE transactional = false;
CREATE INDEX IF NOT EXISTS idx_lifecycle_email_log_staff
  ON public.lifecycle_email_log (staff_id, sent_at DESC)
  WHERE transactional = false;
-- Super-admin dashboard listing.
CREATE INDEX IF NOT EXISTS idx_lifecycle_email_log_key
  ON public.lifecycle_email_log (email_key, created_at DESC);

-- Append-only-ish: no DELETE ever; UPDATE only to finalize a 'pending' row
-- (pending -> sent / failed). A finalized row is immutable.
CREATE OR REPLACE FUNCTION public.guard_lifecycle_email_log_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'lifecycle_email_log is append-only (no delete)';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'lifecycle_email_log row is immutable once finalized (status=%)', OLD.status;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION public.guard_lifecycle_email_log_mutation() SET search_path = '';

DROP TRIGGER IF EXISTS trg_lifecycle_email_log_guard ON public.lifecycle_email_log;
CREATE TRIGGER trg_lifecycle_email_log_guard
  BEFORE UPDATE OR DELETE ON public.lifecycle_email_log
  FOR EACH ROW EXECUTE FUNCTION public.guard_lifecycle_email_log_mutation();

ALTER TABLE public.lifecycle_email_log ENABLE ROW LEVEL SECURITY;

-- Read-only for super-admins via the authenticated client; all writes happen
-- through the service-role client (cron + webhook), which bypasses RLS.
CREATE POLICY "lifecycle_email_log_super_admin_all" ON public.lifecycle_email_log
  FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── Opt-out (désinscription) for non-transactional lifecycle emails ─────────
-- Transactional emails (banking confirmation, payout-failure alert) ignore this.
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS lifecycle_emails_opt_out_at timestamptz;
ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS lifecycle_emails_opt_out_at timestamptz;

-- ─── Indexes for activation / re-engagement queries ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_estab_succeeded
  ON public.transactions (establishment_id, succeeded_at DESC)
  WHERE status = 'succeeded';
CREATE INDEX IF NOT EXISTS idx_transactions_staff_succeeded
  ON public.transactions (staff_id, succeeded_at DESC)
  WHERE status = 'succeeded';

NOTIFY pgrst, 'reload schema';
