-- ============================================================
-- Digitip Pro included for everyone at launch
--
-- Pro is not sold yet. Every group, existing and new, gets the review
-- invitation and the compliments for free, with no trial and no upsell. The
-- point of launching this way is to sell plaques: the Google review is the
-- strongest argument a sales pitch has, and gating it behind a subscription
-- before the product has customers weakens the thing that earns the money.
--
-- When Pro goes on sale, it is for groups created from then on. A later
-- migration flips the default to false, and every row written before keeps
-- its true: the first customers are never asked to pay for something they
-- were given. Pair that migration with `PRO_ON_SALE` in
-- lib/billing/pro-offer.ts, which decides whether the offer is shown at all.
-- ============================================================

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS pro_included boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.groups.pro_included IS
  'Pro features granted at no charge, independent of any subscription. True for every group created while Pro is not on sale; never cleared once set.';

-- Same functions as 00088, one condition wider.
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
      WHEN g.pro_included OR g.plan = 'pro' OR g.pro_trial_ends_at > now() THEN e.google_review_url
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
      WHEN g.pro_included OR g.plan = 'pro' OR g.pro_trial_ends_at > now() THEN e.google_review_url
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
