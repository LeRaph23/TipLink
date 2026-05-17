-- Ambassador monthly challenge: a super-admin-toggled, one-month competition
-- where the #1 ambassador by sales wins a fixed cash prize that is auto-credited
-- on settlement. Default state is no challenge running, so the competition is
-- invisible to ambassadors until a super-admin activates it.
-- Used by:
--  - actions/admin/ambassadors.ts setMonthlyChallengeActive: activate/cancel.
--  - app/api/cron/ambassador-reminders/route.ts: settles elapsed challenges.
--  - lib/ambassador-monthly-challenge.ts: read/settle/credit helpers.

CREATE TABLE IF NOT EXISTS public.ambassador_monthly_challenges (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_cents           integer     NOT NULL DEFAULT 10000 CHECK (prize_cents >= 0),
  starts_at             timestamptz NOT NULL DEFAULT now(),
  ends_at               timestamptz NOT NULL,
  status                text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'settled', 'canceled')),
  winner_ambassador_id  uuid        REFERENCES public.ambassadors(id) ON DELETE SET NULL,
  winner_sales_count    integer,
  activated_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  settled_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amb_monthly_challenge_ends_after_start CHECK (ends_at > starts_at)
);

-- At most one challenge may be 'active' at a time. The partial index covers
-- only active rows; since they all share the same status value, uniqueness on
-- that column caps the running-challenge count at one.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_ambassador_challenge
  ON public.ambassador_monthly_challenges (status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_amb_monthly_challenge_winner
  ON public.ambassador_monthly_challenges (winner_ambassador_id)
  WHERE status = 'settled';

ALTER TABLE public.ambassador_monthly_challenges ENABLE ROW LEVEL SECURITY;

-- All ambassador-facing reads go through the service role (RLS bypassed);
-- this policy only governs direct authenticated access from the admin surface.
CREATE POLICY "amb_monthly_challenge_super_admin_all"
  ON public.ambassador_monthly_challenges
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
