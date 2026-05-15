-- Transaction safety: track refunds, disputes, reversals, and the transfer
-- to the connected account, so we can reverse transfers when refunds or
-- chargebacks happen and prevent platform negative balance.

ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'disputed';
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'reversed';
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'partially_refunded';

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS succeeded_at            timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_amount         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_charge_id        text,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id      text,
  ADD COLUMN IF NOT EXISTS application_fee_amount  integer,
  ADD COLUMN IF NOT EXISTS dispute_id              text,
  ADD COLUMN IF NOT EXISTS reversed_at             timestamptz;

CREATE INDEX IF NOT EXISTS idx_transactions_succeeded_at
  ON public.transactions(succeeded_at)
  WHERE status = 'succeeded';

CREATE INDEX IF NOT EXISTS idx_transactions_stripe_charge_id
  ON public.transactions(stripe_charge_id);
