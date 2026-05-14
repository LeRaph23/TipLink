-- The smarttag_orders.pack CHECK constraint still listed the legacy
-- ('s','m','l') sizing codes, but the express + auth checkout flows write
-- the modern pack ids ('solo','duo'). Every pack-express PaymentIntent
-- webhook silently failed at INSERT (the handler ignored the supabase error),
-- leaving orders missing from the admin dashboard and no confirmation email.
--
-- This migration migrates any leftover legacy rows and replaces the
-- constraint with the modern values.

ALTER TABLE public.smarttag_orders DROP CONSTRAINT IF EXISTS smarttag_orders_pack_check;

UPDATE public.smarttag_orders SET pack = 'duo'  WHERE pack IN ('m', 'l');
UPDATE public.smarttag_orders SET pack = 'solo' WHERE pack = 's';

ALTER TABLE public.smarttag_orders
  ADD CONSTRAINT smarttag_orders_pack_check CHECK (pack IN ('solo', 'duo'));
