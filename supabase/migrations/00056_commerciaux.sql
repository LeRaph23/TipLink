-- Commerciaux Pros (VRP, agents commerciaux, indépendants B2B).
--
-- Programme parallèle aux ambassadeurs avec un barème supérieur
-- (50€ solo / 65€ duo vs 35/45) et un cadre 100% professionnel.
-- Champs B2B obligatoires : raison sociale, forme juridique, SIRET,
-- statut VRP. Pas de parrainage ni de bonus — uniquement commissions
-- sur ventes + payouts Stripe Connect, sur le même rail que les
-- ambassadeurs mais dans des tables séparées (zéro risque de mélange).

-- ─── commerciaux ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commerciaux (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text        NOT NULL,                       -- prénom + nom d'affichage
  company_name         text        NOT NULL,
  legal_form           text        NOT NULL
                                   CHECK (legal_form IN
                                     ('sarl','sas','sasu','ei','auto_entrepreneur','eurl','sa','autre')),
  vat_number           text,                                       -- TVA intracommunautaire (optionnelle)
  vrp_status           text        NOT NULL
                                   CHECK (vrp_status IN
                                     ('vrp_exclusif','vrp_multicarte','agent_commercial','independant','autre')),
  sector               text,                                       -- secteur géographique
  siret                text        NOT NULL,                       -- requis (vs ambassadeurs où c'est optionnel)
  email                text        NOT NULL,
  phone                text        NOT NULL,
  city                 text        NOT NULL,

  promo_code_id        uuid        NOT NULL UNIQUE
                                   REFERENCES public.promo_codes(id) ON DELETE RESTRICT,
  pin_hash             text,
  pin_salt             text,
  pin_setup_token      text        UNIQUE,
  pin_setup_expires_at timestamptz,

  stripe_account_id    text        UNIQUE,
  onboarding_status    text        NOT NULL DEFAULT 'not_started'
                                   CHECK (onboarding_status IN
                                     ('not_started','pending','verified','rejected')),

  is_active            boolean     NOT NULL DEFAULT true,
  payouts_frozen       boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commerciaux_active
  ON public.commerciaux(is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_commerciaux_promo
  ON public.commerciaux(promo_code_id);
CREATE INDEX IF NOT EXISTS idx_commerciaux_stripe_account
  ON public.commerciaux(stripe_account_id);

-- ─── commercial_sales ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_sales (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_id      uuid        NOT NULL REFERENCES public.commerciaux(id) ON DELETE CASCADE,
  smarttag_order_id  uuid        NOT NULL UNIQUE
                                 REFERENCES public.smarttag_orders(id) ON DELETE CASCADE,
  pack               text        NOT NULL CHECK (pack IN ('solo','duo')),
  commission_amount  integer     NOT NULL,                         -- centimes : 5000 (solo) / 6500 (duo)
  salon_name_partial text,
  voided_at          timestamptz,
  void_reason        text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commercial_sales_commercial
  ON public.commercial_sales(commercial_id, created_at DESC);

-- ─── commercial_payouts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_payouts (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_id      uuid        NOT NULL REFERENCES public.commerciaux(id) ON DELETE CASCADE,
  amount_cents       integer     NOT NULL CHECK (amount_cents >= 3000),
  status             text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','paid','failed','canceled')),
  stripe_transfer_id text,
  stripe_payout_id   text,
  failure_reason     text,
  requested_at       timestamptz NOT NULL DEFAULT now(),
  paid_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_commercial_payouts_commercial
  ON public.commercial_payouts(commercial_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_commercial_payouts_status
  ON public.commercial_payouts(status, requested_at DESC);

-- ─── commercial_recruitment_applications ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_recruitment_applications (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name        text        NOT NULL,
  last_name         text        NOT NULL,
  email             text        NOT NULL,
  phone             text        NOT NULL,
  city              text        NOT NULL,
  sector            text,
  company_name      text        NOT NULL,
  legal_form        text        NOT NULL,
  vat_number        text,
  siret             text        NOT NULL,
  vrp_status        text        NOT NULL,
  notes             text,
  no_fraud_pledge   boolean     NOT NULL,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','accepted','rejected')),
  reviewed_at       timestamptz,
  ip_hash           text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commercial_apps_status
  ON public.commercial_recruitment_applications(status, created_at DESC);

-- ─── RLS — super-admin only (PIN-protected portal will use the service client) ─
ALTER TABLE public.commerciaux                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_sales                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_payouts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_recruitment_applications  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commerciaux_super_admin_all" ON public.commerciaux
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "commercial_sales_super_admin_all" ON public.commercial_sales
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "commercial_payouts_super_admin_all" ON public.commercial_payouts
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "commercial_apps_super_admin_all" ON public.commercial_recruitment_applications
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── promo_codes : discriminer ambassadeur vs commercial ─────────────────────
-- Permet au webhook Stripe de router la commission vers la bonne table.
-- Codes existants gardés en 'ambassador' par défaut (les seuls liés à ce
-- jour le sont via la table ambassadors).
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS seller_type text
    CHECK (seller_type IS NULL OR seller_type IN ('ambassador','commercial'));

UPDATE public.promo_codes pc
SET seller_type = 'ambassador'
WHERE seller_type IS NULL
  AND EXISTS (SELECT 1 FROM public.ambassadors a WHERE a.promo_code_id = pc.id);
