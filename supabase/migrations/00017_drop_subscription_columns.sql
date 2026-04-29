ALTER TABLE public.groups
  DROP COLUMN IF EXISTS subscription_id,
  DROP COLUMN IF EXISTS subscription_status,
  DROP COLUMN IF EXISTS subscription_pack;

NOTIFY pgrst, 'reload schema';
