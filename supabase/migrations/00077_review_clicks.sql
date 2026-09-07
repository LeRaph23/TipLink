-- ============================================================
-- Did the review invitation produce anything?
--
-- The post-tip Google review invitation is the headline feature of Digitip
-- Pro, and until now nothing recorded whether a single customer ever pressed
-- it. The button on the tip success page was a bare <a href>. So a subscriber
-- had no way to tell whether what they pay for works, and the product had no
-- honest way to say what it is worth: the Pro card lists three features and
-- claims nothing, because there was nothing to claim.
--
-- One row per tip whose customer opened the review page. Not on `transactions`
-- (a fiscal record that nothing outside the payment path should write) and not
-- a counter column (a counter cannot answer "which month"), so: a small table
-- beside it.
--
-- What this deliberately does NOT record: no customer identity, no IP, no user
-- agent. The question is "how many", and anything finer would be tracking the
-- tipper, who is not our user and never agreed to anything.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.review_clicks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  clicked_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per tip, not per press. A customer who taps twice, or comes back to
-- the page from their email, is still one customer who went to leave a review,
-- and "12 of your 47 tips led someone to the review page" is the only version
-- of this number that means anything. It also bounds the table: a row can only
-- exist where a real tip exists.
CREATE UNIQUE INDEX IF NOT EXISTS review_clicks_transaction_key
  ON public.review_clicks (transaction_id);

CREATE INDEX IF NOT EXISTS idx_review_clicks_establishment_month
  ON public.review_clicks (establishment_id, clicked_at DESC);

COMMENT ON TABLE public.review_clicks IS
  'One row per tip whose customer opened the Google review page. Written by /api/reviews/click with the service role; never by the tipper directly.';

ALTER TABLE public.review_clicks ENABLE ROW LEVEL SECURITY;

-- Read-only, and only for the people who own the establishment. There is no
-- insert policy on purpose: the writer is an API route holding the service
-- role, which checks that the transaction is real, succeeded, and recent. An
-- anon insert policy would let anyone with an establishment id manufacture
-- the number a subscription is sold on.
CREATE POLICY review_clicks_scoped_select ON public.review_clicks
  FOR SELECT USING (
    is_super_admin()
    OR establishment_id = ANY (get_my_managed_establishment_ids())
    OR EXISTS (
      SELECT 1 FROM public.establishments e
      WHERE e.id = review_clicks.establishment_id
        AND e.group_id = ANY (get_my_group_ids())
    )
  );
