-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE business_type AS ENUM ('restaurant', 'beauty');
CREATE TYPE transaction_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
CREATE TYPE stripe_onboarding_status AS ENUM ('not_started', 'pending', 'complete');
CREATE TYPE user_role AS ENUM ('super_admin', 'group_admin', 'manager', 'staff');

-- ============================================================
-- GROUPS (HQ / top-level tenant)
-- ============================================================
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  logo_url    TEXT,
  -- settings shape: { "tip_thresholds": [1, 2, 5, 10], "default_currency": "EUR" }
  settings    JSONB NOT NULL DEFAULT '{"tip_thresholds": [1, 2, 5, 10]}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- ============================================================
-- ESTABLISHMENTS (physical locations within a group)
-- ============================================================
CREATE TABLE establishments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            UUID NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  name                TEXT NOT NULL,
  business_type       business_type NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  stripe_account_id   TEXT,
  country             CHAR(2) NOT NULL DEFAULT 'FR',
  currency            CHAR(3) NOT NULL DEFAULT 'EUR',
  onboarding_status   stripe_onboarding_status NOT NULL DEFAULT 'not_started',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_establishments_group_id ON establishments(group_id);
CREATE INDEX idx_establishments_slug ON establishments(slug);

-- ============================================================
-- STAFF PROFILES
-- ============================================================
CREATE TABLE staff_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id    UUID NOT NULL REFERENCES establishments(id) ON DELETE RESTRICT,
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name           TEXT NOT NULL,
  avatar_url          TEXT,
  stripe_account_id   TEXT,
  onboarding_status   stripe_onboarding_status NOT NULL DEFAULT 'not_started',
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_staff_profiles_establishment_id ON staff_profiles(establishment_id);
CREATE INDEX idx_staff_profiles_user_id ON staff_profiles(user_id);

-- ============================================================
-- NFC STICKERS
-- ============================================================
CREATE TABLE nfc_stickers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id          TEXT NOT NULL UNIQUE,
  staff_id          UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
  establishment_id  UUID REFERENCES establishments(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Either staff or establishment must be set, or neither during provisioning
  CONSTRAINT nfc_stickers_target_check CHECK (
    (staff_id IS NOT NULL AND establishment_id IS NULL)
    OR (staff_id IS NULL AND establishment_id IS NOT NULL)
    OR (staff_id IS NULL AND establishment_id IS NULL)
  )
);

CREATE UNIQUE INDEX idx_nfc_stickers_short_id ON nfc_stickers(short_id);
CREATE INDEX idx_nfc_stickers_staff_id ON nfc_stickers(staff_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER nfc_stickers_updated_at
  BEFORE UPDATE ON nfc_stickers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TRANSACTIONS (immutable — fiscal record)
-- ============================================================
CREATE TABLE transactions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount                    INTEGER NOT NULL CHECK (amount > 0),
  currency                  CHAR(3) NOT NULL,
  staff_id                  UUID REFERENCES staff_profiles(id) ON DELETE RESTRICT,
  establishment_id          UUID NOT NULL REFERENCES establishments(id) ON DELETE RESTRICT,
  stripe_payment_intent_id  TEXT,
  stripe_session_id         TEXT UNIQUE,
  status                    transaction_status NOT NULL DEFAULT 'pending',
  -- metadata shape: { "table_number": "4", "mirror_id": "m1", "source": "nfc" }
  metadata                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key           TEXT NOT NULL UNIQUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No deleted_at: transactions are immutable for fiscal integrity
);

CREATE INDEX idx_transactions_staff_id ON transactions(staff_id);
CREATE INDEX idx_transactions_establishment_id ON transactions(establishment_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

-- ============================================================
-- WEBHOOK EVENTS (idempotency log for Stripe webhooks)
-- ============================================================
CREATE TABLE webhook_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  processed_at    TIMESTAMPTZ,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_events_stripe_event_id ON webhook_events(stripe_event_id);
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);

-- ============================================================
-- USER ROLES (multi-tenant access control mapping)
-- ============================================================
CREATE TABLE user_roles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role              user_role NOT NULL,
  group_id          UUID REFERENCES groups(id) ON DELETE CASCADE,
  establishment_id  UUID REFERENCES establishments(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_scope_check CHECK (
    (role = 'super_admin' AND group_id IS NULL AND establishment_id IS NULL)
    OR (role = 'group_admin' AND group_id IS NOT NULL AND establishment_id IS NULL)
    OR (role = 'manager' AND establishment_id IS NOT NULL)
    OR (role = 'staff' AND establishment_id IS NOT NULL)
  )
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE UNIQUE INDEX idx_user_roles_unique ON user_roles(
  user_id,
  role,
  COALESCE(group_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
