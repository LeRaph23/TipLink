-- Referral program for ambassadors + cold email outreach infrastructure.
--
-- Each ambassador gets a personal referral code. When a candidate signs up
-- with that code and (a) is approved by super-admin AND (b) makes >=2 sales,
-- the referrer earns a 25€ bonus. Lifetime milestones at 5 and 10 validated
-- referrals pay additional one-shot bonuses.
--
-- Cold email tables drive a 3-step sequence to prospects scraped from the
-- public INSEE SIRENE database, with GDPR-compliant unsubscribe.

-- ─── ambassadors: referral columns ───────────────────────────────────────────
ALTER TABLE public.ambassadors
  ADD COLUMN IF NOT EXISTS referrer_ambassador_id uuid REFERENCES public.ambassadors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_code          text UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_validated_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_ambassadors_referrer
  ON public.ambassadors(referrer_ambassador_id);

CREATE INDEX IF NOT EXISTS idx_ambassadors_referral_code
  ON public.ambassadors(referral_code) WHERE referral_code IS NOT NULL;

-- ─── recruitment applications: referral attribution ─────────────────────────
ALTER TABLE public.ambassador_recruitment_applications
  ADD COLUMN IF NOT EXISTS referrer_ambassador_id uuid REFERENCES public.ambassadors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referrer_code_used     text,
  ADD COLUMN IF NOT EXISTS source                 text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS reminder_count         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_at       timestamptz;

CREATE INDEX IF NOT EXISTS idx_recruitment_applications_reminders
  ON public.ambassador_recruitment_applications(status, reminder_count, last_reminder_at)
  WHERE status = 'pending';

-- ─── referral_payouts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_payouts (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_ambassador_id  uuid        NOT NULL REFERENCES public.ambassadors(id) ON DELETE CASCADE,
  referred_ambassador_id  uuid        NOT NULL REFERENCES public.ambassadors(id) ON DELETE CASCADE,
  amount_cents            integer     NOT NULL CHECK (amount_cents > 0),
  reason                  text        NOT NULL CHECK (reason IN ('validation','milestone_5','milestone_10')),
  status                  text        NOT NULL DEFAULT 'pending'
                                       CHECK (status IN ('pending','credited','voided')),
  credited_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referrer_ambassador_id, referred_ambassador_id, reason)
);

CREATE INDEX IF NOT EXISTS idx_referral_payouts_referrer
  ON public.referral_payouts(referrer_ambassador_id, created_at DESC);

ALTER TABLE public.referral_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_payouts_super_admin_all" ON public.referral_payouts
  FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── referral_email_log (anti-flood on "email a buddy" button) ─────────────
CREATE TABLE IF NOT EXISTS public.referral_email_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id   uuid        NOT NULL REFERENCES public.ambassadors(id) ON DELETE CASCADE,
  recipient_email text        NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_email_log_ambassador_day
  ON public.referral_email_log(ambassador_id, sent_at DESC);

ALTER TABLE public.referral_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_email_log_super_admin_all" ON public.referral_email_log
  FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── cold_email_prospects ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cold_email_prospects (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  siret                text        NOT NULL UNIQUE,
  company_name         text,
  email                text,
  first_name           text,
  city                 text,
  naf_code             text,
  creation_date        date,
  birth_year_estimate  integer,
  imported_at          timestamptz NOT NULL DEFAULT now(),
  sequence_step        integer     NOT NULL DEFAULT 0 CHECK (sequence_step BETWEEN 0 AND 3),
  last_sent_at         timestamptz,
  replied_at           timestamptz,
  unsubscribed_at      timestamptz,
  clicked_landing_at   timestamptz,
  notes                text
);

CREATE INDEX IF NOT EXISTS idx_cold_email_prospects_step_sent
  ON public.cold_email_prospects(sequence_step, last_sent_at)
  WHERE unsubscribed_at IS NULL AND replied_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cold_email_prospects_email
  ON public.cold_email_prospects(email) WHERE email IS NOT NULL;

ALTER TABLE public.cold_email_prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cold_email_prospects_super_admin_all" ON public.cold_email_prospects
  FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── Update seeded email template to reflect new bonus amounts ──────────────
UPDATE public.ambassador_email_templates
SET body_html = '<h2 style="color:#fff;font-size:20px;margin:0 0 12px">Bienvenue {{first_name}} !</h2>
<p>Ton compte ambassadeur est actif. Voici tout ce que tu dois savoir :</p>
<ul>
  <li>Ton code promo personnel : <strong style="color:#fff">{{promo_code}}</strong></li>
  <li>Tu touches <strong>25€ par vente Solo</strong> et <strong>35€ par vente Duo</strong></li>
  <li>Bonus hebdo : 5 ventes +15€, 8 ventes +30€, 10 ventes +50€</li>
  <li><strong>Parraine d''autres ambassadeurs</strong> : 25€ par filleul validé (après 2 ventes), +100€ aux 5 filleuls, +250€ aux 10 filleuls</li>
</ul>
<p>Accède à ton dashboard pour suivre tes commissions, configurer ta banque et récupérer ton code parrainage :</p>
<p><a href="{{dashboard_url}}" style="display:inline-block;padding:10px 18px;background:#22c55e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Ouvrir mon dashboard →</a></p>
<p style="font-size:12px;color:#888;margin-top:20px">À toi de jouer !</p>'
WHERE slug = 'welcome' AND is_seeded = true;

UPDATE public.ambassador_email_templates
SET body_html = '<h2 style="color:#fff;font-size:20px;margin:0 0 12px">{{first_name}}, tu es au top 🔥</h2>
<p>On voulait te féliciter personnellement pour tes performances cette semaine. Continue comme ça, tu vas exploser le leaderboard du mois (100€ pour le #1).</p>
<p>Rappel des paliers :</p>
<ul>
  <li>5 ventes / semaine → +15€</li>
  <li>8 ventes / semaine → +30€</li>
  <li>10 ventes / semaine → +50€</li>
</ul>
<p>Et n''oublie pas : <strong>25€ par filleul validé</strong>, +100€ aux 5 filleuls, +250€ aux 10. Partage ton lien depuis ton dashboard.</p>
<p><a href="{{dashboard_url}}" style="display:inline-block;padding:10px 18px;background:#22c55e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Voir mes stats →</a></p>'
WHERE slug = 'milestone' AND is_seeded = true;
