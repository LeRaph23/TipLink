-- Which campaign brought each paid pack order.
--
-- Filled by the Stripe webhook from the PaymentIntent metadata, which the
-- checkout routes copy from the visitor's first-party attribution cookie
-- (lib/marketing/attribution.ts). Null for an order with no tagged visit in
-- the 30 days before it: direct, search or word of mouth.
--
-- Shape: { source, medium, campaign, content, term, landing, at }, all strings,
-- only `source` and `at` guaranteed. Campaign parameters only, no identifier.

alter table public.smarttag_orders
  add column if not exists attribution jsonb;

-- The admin acquisition view groups recent orders by source.
create index if not exists smarttag_orders_attribution_source_idx
  on public.smarttag_orders ((attribution ->> 'source'))
  where attribution is not null;
