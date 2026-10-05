-- ============================================================
-- Digitip Pro, second version: a reputation product
--
-- Three changes, one idea. Pro used to bundle the Google review invitation
-- with the payroll export, and nobody could say what it was for. The export is
-- now free for everyone (no SQL involved: the gate lived in the API route), and
-- Pro becomes "more Google reviews, and a team that hears what customers think
-- of it":
--
--   1. a free trial that needs no card, started by the first real tip, so a
--      manager sees the feature work on their own customers before being asked
--      to pay for it
--   2. compliments: after the tip, the customer can leave a word for the person
--      who served them, which nothing but Digitip can do because nothing else
--      knows who that was
--   3. the Google rating and review count on the dashboard, read live (not
--      stored: see section 3)
-- ============================================================

-- ── 1. Free trial, no card ───────────────────────────────────────────────────
-- Not `trial_ends_at`: that column belongs to the Stripe subscription and the
-- subscription webhook rewrites it on every event, nulling it for a
-- subscription without a Stripe trial. A trial granted here would be erased by
-- the first checkout, and with it the record that it was ever used.
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS pro_trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS pro_trial_ends_at timestamptz;

COMMENT ON COLUMN public.groups.pro_trial_started_at IS
  'When the cardless Digitip Pro trial began (first real tip). Set once, never cleared: it is also the record that the trial was used.';
COMMENT ON COLUMN public.groups.pro_trial_ends_at IS
  'End of the cardless Pro trial. Pro is effective while plan = ''pro'' OR this is in the future.';

-- The review invitation is gated in SQL because these RPCs are callable by
-- anon (see 00076). Same functions, same return types, one condition wider.
CREATE OR REPLACE FUNCTION public.get_public_staff(p_staff_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  establishment_name text,
  establishment_currency char(3),
  tip_thresholds jsonb,
  is_payable boolean,
  group_logo_url text,
  establishment_review_url text,
  establishment_is_demo boolean,
  fee_fixed_cents integer,
  fee_bps integer
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    s.id,
    s.full_name,
    s.avatar_url,
    e.name,
    e.currency,
    COALESCE(g.settings->'tip_thresholds', '[1,2,5,10]'::jsonb),
    (
      s.is_active
      AND s.deleted_at IS NULL
      AND e.deleted_at IS NULL
      AND g.deleted_at IS NULL
      AND (
        e.is_demo
        OR (
          e.stripe_account_id IS NOT NULL
          AND e.stripe_charges_enabled
          AND e.stripe_payouts_enabled
        )
      )
    ),
    g.logo_url,
    CASE
      WHEN g.plan = 'pro' OR g.pro_trial_ends_at > now() THEN e.google_review_url
      ELSE NULL
    END,
    e.is_demo,
    g.platform_fixed_fee_cents,
    g.platform_fee_bps
  FROM staff_profiles s
  JOIN establishments e ON e.id = s.establishment_id
  JOIN groups g ON g.id = e.group_id
  WHERE s.id = p_staff_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_staff(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_establishment_review(p_establishment_id uuid)
RETURNS TABLE (
  establishment_name text,
  establishment_review_url text
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    e.name,
    CASE
      WHEN g.plan = 'pro' OR g.pro_trial_ends_at > now() THEN e.google_review_url
      ELSE NULL
    END
  FROM establishments e
  JOIN groups g ON g.id = e.group_id
  WHERE e.id = p_establishment_id
    AND e.deleted_at IS NULL
    AND g.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_public_establishment_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_establishment_review(uuid) TO anon, authenticated;

-- ── 2. Compliments ───────────────────────────────────────────────────────────
-- One per tip, like review_clicks, and for the same reason: a row can only
-- exist where a real tip exists, so the number cannot be manufactured.
--
-- Compliments only, deliberately: chips naming what went well, and an optional
-- sentence. No star rating. A rating would invite exactly the pattern Google
-- forbids (send the happy ones to Google, keep the unhappy ones private), and
-- the invitation to review is shown to every tipper whatever they write here.
--
-- No customer identity, as with review_clicks: the tipper is not our user.
CREATE TABLE IF NOT EXISTS public.tip_compliments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  -- Null for a team tip: the compliment goes to the whole team.
  staff_id         UUID REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  tags             TEXT[] NOT NULL DEFAULT '{}',
  message          TEXT,
  -- A manager can take a message down (it is free text written by a stranger).
  -- Hidden rows stay counted for the manager and disappear for the employee.
  hidden_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tip_compliments_message_len CHECK (message IS NULL OR char_length(message) <= 280),
  CONSTRAINT tip_compliments_tags_known CHECK (
    tags <@ ARRAY['welcome', 'advice', 'speed', 'smile', 'care']::text[]
  ),
  CONSTRAINT tip_compliments_not_empty CHECK (
    cardinality(tags) > 0 OR (message IS NOT NULL AND char_length(btrim(message)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tip_compliments_transaction_key
  ON public.tip_compliments (transaction_id);
CREATE INDEX IF NOT EXISTS idx_tip_compliments_establishment_created
  ON public.tip_compliments (establishment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tip_compliments_staff_created
  ON public.tip_compliments (staff_id, created_at DESC)
  WHERE staff_id IS NOT NULL;

COMMENT ON TABLE public.tip_compliments IS
  'A word from a tipper for whoever served them (Digitip Pro). Written by /api/compliments with the service role only.';

ALTER TABLE public.tip_compliments ENABLE ROW LEVEL SECURITY;

-- Owners and managers see every row of their establishments; an employee sees
-- the compliments addressed to them, minus the ones a manager took down. No
-- insert or update policy: writes go through routes holding the service role.
DROP POLICY IF EXISTS tip_compliments_scoped_select ON public.tip_compliments;
CREATE POLICY tip_compliments_scoped_select ON public.tip_compliments
  FOR SELECT USING (
    is_super_admin()
    OR establishment_id = ANY (get_my_managed_establishment_ids())
    OR EXISTS (
      SELECT 1 FROM public.establishments e
      WHERE e.id = tip_compliments.establishment_id
        AND e.group_id = ANY (get_my_group_ids())
    )
    OR (hidden_at IS NULL AND staff_id IS NOT NULL AND staff_id = get_my_staff_profile_id())
  );

-- ── 3. Google listing ───────────────────────────────────────────────────────
-- Deliberately no table. Google's Places API policies allow storing the place
-- ID only, so the rating and review count are read live at display time
-- (lib/google-listing.ts) and never written here. The place ID is already on
-- `establishments` (00070).
