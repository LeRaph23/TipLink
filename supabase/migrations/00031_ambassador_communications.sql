-- Ambassador communications: emails templates + send logs + contracts (e-signed)
--
-- Admin can send templated emails to ambassadors with placeholders and track
-- every send immutably. Admin can also send a legal contract to an ambassador;
-- the ambassador signs it from their PIN-protected dashboard via canvas capture,
-- with full audit trail (IP hash, UA, content hash, snapshot, timestamp).
-- Signed contracts are immutable.

-- ─── Email templates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ambassador_email_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  subject     text NOT NULL,
  body_html   text NOT NULL,
  is_seeded   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── Email send log (append-only) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ambassador_email_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id   uuid NOT NULL REFERENCES public.ambassadors(id) ON DELETE CASCADE,
  template_id     uuid REFERENCES public.ambassador_email_templates(id) ON DELETE SET NULL,
  template_slug   text,
  subject         text NOT NULL,
  body_html       text NOT NULL,
  to_email        text NOT NULL,
  sent_by         uuid NOT NULL,
  resend_id       text,
  status          text NOT NULL CHECK (status IN ('sent','failed')),
  error           text,
  sent_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ambassador_email_logs_ambassador
  ON public.ambassador_email_logs(ambassador_id, sent_at DESC);

-- Append-only: forbid UPDATE/DELETE on logs
CREATE OR REPLACE FUNCTION public.forbid_email_log_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ambassador_email_logs is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_email_logs_no_update ON public.ambassador_email_logs;
CREATE TRIGGER trg_email_logs_no_update
  BEFORE UPDATE OR DELETE ON public.ambassador_email_logs
  FOR EACH ROW EXECUTE FUNCTION public.forbid_email_log_mutation();

-- ─── Contract templates (versioned) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ambassador_contract_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  version        int  NOT NULL DEFAULT 1,
  body_html      text NOT NULL,
  consent_text   text NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── Contracts (per-ambassador instances) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ambassador_contracts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id         uuid NOT NULL REFERENCES public.ambassadors(id) ON DELETE CASCADE,
  template_id           uuid REFERENCES public.ambassador_contract_templates(id) ON DELETE SET NULL,
  title                 text NOT NULL,
  content_snapshot      text NOT NULL,
  content_hash          text NOT NULL,
  consent_text          text NOT NULL,
  status                text NOT NULL DEFAULT 'sent'
                            CHECK (status IN ('sent','viewed','signed','revoked')),
  sent_by               uuid NOT NULL,
  sent_at               timestamptz NOT NULL DEFAULT now(),
  viewed_at             timestamptz,
  signed_at             timestamptz,
  signature_image_path  text,
  signer_ip_hash        text,
  signer_user_agent     text,
  revoked_at            timestamptz,
  revoked_reason        text
);
CREATE INDEX IF NOT EXISTS idx_ambassador_contracts_ambassador
  ON public.ambassador_contracts(ambassador_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_ambassador_contracts_status
  ON public.ambassador_contracts(status);

-- Immutability trigger: once signed, no further changes allowed
CREATE OR REPLACE FUNCTION public.enforce_signed_contract_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'Signed contracts are immutable (contract_id=%)', OLD.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contracts_immutable ON public.ambassador_contracts;
CREATE TRIGGER trg_contracts_immutable
  BEFORE UPDATE ON public.ambassador_contracts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_signed_contract_immutability();

-- Prevent deletion of signed contracts (only super-admin should ever try)
CREATE OR REPLACE FUNCTION public.forbid_signed_contract_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'Signed contracts cannot be deleted';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_contracts_no_delete_signed ON public.ambassador_contracts;
CREATE TRIGGER trg_contracts_no_delete_signed
  BEFORE DELETE ON public.ambassador_contracts
  FOR EACH ROW EXECUTE FUNCTION public.forbid_signed_contract_delete();

-- ─── Contract audit log (append-only) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ambassador_contract_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   uuid NOT NULL REFERENCES public.ambassador_contracts(id) ON DELETE CASCADE,
  action        text NOT NULL CHECK (action IN ('sent','viewed','signed','revoked','downloaded')),
  actor_type    text NOT NULL CHECK (actor_type IN ('admin','ambassador','system')),
  actor_id      text,
  ip_hash       text,
  user_agent    text,
  details       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ambassador_contract_audit_contract
  ON public.ambassador_contract_audit_log(contract_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.forbid_contract_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ambassador_contract_audit_log is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_contract_audit_no_mutate ON public.ambassador_contract_audit_log;
CREATE TRIGGER trg_contract_audit_no_mutate
  BEFORE UPDATE OR DELETE ON public.ambassador_contract_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.forbid_contract_audit_mutation();

-- Harden trigger functions with explicit empty search_path
ALTER FUNCTION public.forbid_email_log_mutation()              SET search_path = '';
ALTER FUNCTION public.enforce_signed_contract_immutability()    SET search_path = '';
ALTER FUNCTION public.forbid_signed_contract_delete()           SET search_path = '';
ALTER FUNCTION public.forbid_contract_audit_mutation()          SET search_path = '';

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- super_admin only via authenticated client. Ambassador-side access happens
-- through Next.js API routes using the service-role client after verifying
-- the signed PIN session cookie.

ALTER TABLE public.ambassador_email_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassador_email_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassador_contract_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassador_contracts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassador_contract_audit_log    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ambassador_email_templates_super_admin_all"
  ON public.ambassador_email_templates
  FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "ambassador_email_logs_super_admin_all"
  ON public.ambassador_email_logs
  FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "ambassador_contract_templates_super_admin_all"
  ON public.ambassador_contract_templates
  FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "ambassador_contracts_super_admin_all"
  ON public.ambassador_contracts
  FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "ambassador_contract_audit_log_super_admin_all"
  ON public.ambassador_contract_audit_log
  FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── Seeded email templates ─────────────────────────────────────────────────
INSERT INTO public.ambassador_email_templates (slug, name, subject, body_html, is_seeded) VALUES
('welcome',
 'Bienvenue ambassadeur',
 'Bienvenue dans la team Digitip, {{first_name}} 🎉',
 '<h2 style="color:#fff;font-size:20px;margin:0 0 12px">Bienvenue {{first_name}} !</h2>
<p>Ton compte ambassadeur est actif. Voici tout ce que tu dois savoir :</p>
<ul>
  <li>Ton code promo personnel : <strong style="color:#fff">{{promo_code}}</strong></li>
  <li>Tu touches <strong>25€ par vente Solo</strong> et <strong>35€ par vente Duo</strong></li>
  <li>Bonus hebdo : 5 ventes +25€, 8 ventes +50€, 10 ventes +100€</li>
</ul>
<p>Accède à ton dashboard pour suivre tes commissions et configurer ta banque :</p>
<p><a href="{{dashboard_url}}" style="display:inline-block;padding:10px 18px;background:#22c55e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Ouvrir mon dashboard →</a></p>
<p style="font-size:12px;color:#888;margin-top:20px">À toi de jouer !</p>',
 true),

('training',
 'Kit de vente & formation',
 'Tes outils pour vendre — {{first_name}}',
 '<h2 style="color:#fff;font-size:20px;margin:0 0 12px">Salut {{first_name}}, voici ton kit de vente</h2>
<p>Pour t''aider à closer plus vite, on a rassemblé les meilleures techniques :</p>
<h3 style="color:#fff;font-size:15px;margin:16px 0 6px">L''accroche en 1 phrase</h3>
<p style="font-style:italic;color:#aaa">« Vous savez que vos employés perdent en moyenne 80€ de pourboires par semaine parce qu’ils n’acceptent pas la CB ? Avec notre SmartTag NFC à 39€, c’est réglé en 2 minutes. »</p>
<h3 style="color:#fff;font-size:15px;margin:16px 0 6px">Les objections classiques</h3>
<ul>
  <li><strong>« Je n''ai pas le temps »</strong> → 2 minutes setup, on s''occupe de tout</li>
  <li><strong>« C''est cher »</strong> → Rentabilisé en 1 semaine de pourboires</li>
  <li><strong>« Mes clients préfèrent le cash »</strong> → 70% des Français paient sans contact</li>
</ul>
<p>Ton code : <strong style="color:#fff">{{promo_code}}</strong> · -10% pour tes prospects.</p>
<p>Bonnes ventes 🚀</p>',
 true),

('milestone',
 'Félicitations pour ton objectif',
 'Bravo {{first_name}}, tu débloques un bonus 🏆',
 '<h2 style="color:#fff;font-size:20px;margin:0 0 12px">{{first_name}}, tu es au top 🔥</h2>
<p>On voulait te féliciter personnellement pour tes performances cette semaine. Continue comme ça, tu vas exploser le leaderboard du mois (200€ pour le #1).</p>
<p>Rappel des paliers :</p>
<ul>
  <li>5 ventes / semaine → +25€</li>
  <li>8 ventes / semaine → +50€</li>
  <li>10 ventes / semaine → +100€</li>
</ul>
<p><a href="{{dashboard_url}}" style="display:inline-block;padding:10px 18px;background:#22c55e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Voir mes stats →</a></p>',
 true),

('inactivity',
 'On ne te lâche pas',
 'Tout va bien, {{first_name}} ?',
 '<h2 style="color:#fff;font-size:20px;margin:0 0 12px">Hey {{first_name}} 👋</h2>
<p>On n''a pas vu de vente sur ton code <strong>{{promo_code}}</strong> depuis un moment. Tout va bien ?</p>
<p>Si tu as besoin d''aide (script, démo, support client à reprendre), réponds-moi directement à ce mail, je décroche dans la journée.</p>
<p>Pour rappel, 1 vente Duo = 35€ dans ta poche. 2 ventes par semaine = un resto sympa. 💰</p>
<p>On y croit 🙌</p>',
 true)
ON CONFLICT (slug) DO NOTHING;

-- ─── Seeded contract template ───────────────────────────────────────────────
INSERT INTO public.ambassador_contract_templates (name, version, body_html, consent_text, is_active) VALUES
('Contrat d''ambassadeur Digitip v1', 1,
 '<h1 style="font-size:22px;margin:0 0 8px">Contrat d''apporteur d''affaires — Digitip</h1>
<p style="color:#666;font-size:13px;margin:0 0 24px">Entre Digitip (« la Société ») et {{ambassador_name}} (« l''Ambassadeur »), SIRET {{ambassador_siret}}.</p>

<h2 style="font-size:16px;margin:24px 0 8px">1. Objet</h2>
<p>L''Ambassadeur s''engage à promouvoir les produits SmartTag NFC de Digitip auprès d''établissements de coiffure, beauté et restauration, en utilisant son code promo personnel <strong>{{promo_code}}</strong>. Aucune exclusivité territoriale n''est accordée.</p>

<h2 style="font-size:16px;margin:24px 0 8px">2. Statut</h2>
<p>L''Ambassadeur intervient en qualité d''apporteur d''affaires indépendant. Il n''a en aucun cas la qualité de salarié, d''agent commercial ou de mandataire de la Société. Il déclare disposer d''un statut juridique l''autorisant à percevoir des commissions (auto-entrepreneur, micro-entreprise ou équivalent) et atteste sur l''honneur être à jour de ses obligations fiscales et sociales.</p>

<h2 style="font-size:16px;margin:24px 0 8px">3. Commissions</h2>
<p>L''Ambassadeur perçoit, pour chaque commande SmartTag confirmée et payée via son code promo :</p>
<ul>
  <li>25 € HT par pack Solo (1 SmartTag)</li>
  <li>35 € HT par pack Duo (2 SmartTags)</li>
</ul>
<p>Des bonus hebdomadaires peuvent s''ajouter selon le nombre de ventes réalisées sur la semaine calendaire (lundi-dimanche). Les conditions des bonus sont consultables dans le dashboard ambassadeur et peuvent être modifiées avec un préavis de 14 jours.</p>

<h2 style="font-size:16px;margin:24px 0 8px">4. Versement des commissions</h2>
<p>Les commissions sont versées par virement Stripe Connect sur le compte bancaire que l''Ambassadeur aura renseigné, sous réserve d''un solde minimum de 30 €. Les paiements sont effectués chaque vendredi sur demande de l''Ambassadeur depuis son dashboard.</p>

<h2 style="font-size:16px;margin:24px 0 8px">5. Obligations de l''Ambassadeur</h2>
<ul>
  <li>Ne pas démarcher de manière trompeuse, agressive ou contraire aux dispositions du Code de la consommation.</li>
  <li>Ne pas se présenter comme employé ou représentant exclusif de Digitip.</li>
  <li>Ne pas générer de fausses ventes ni de transactions frauduleuses sous peine de résiliation immédiate et de restitution des commissions perçues.</li>
  <li>Respecter la confidentialité des informations commerciales reçues.</li>
</ul>

<h2 style="font-size:16px;margin:24px 0 8px">6. Durée &amp; résiliation</h2>
<p>Le présent contrat est conclu pour une durée indéterminée à compter de sa signature électronique. Chaque partie peut y mettre fin à tout moment, par simple email, avec effet immédiat. Les commissions dues au titre des ventes réalisées avant la résiliation restent dues.</p>

<h2 style="font-size:16px;margin:24px 0 8px">7. Données personnelles (RGPD)</h2>
<p>Digitip collecte les données personnelles de l''Ambassadeur (nom, email, téléphone, SIRET, IBAN) aux seules fins de la gestion de la relation commerciale, du versement des commissions et du respect des obligations légales. Ces données sont conservées 5 ans après la fin du contrat. L''Ambassadeur dispose d''un droit d''accès, de rectification et d''effacement en écrivant à privacy@digitip.app.</p>

<h2 style="font-size:16px;margin:24px 0 8px">8. Signature électronique</h2>
<p>Le présent contrat est signé électroniquement par l''Ambassadeur depuis son dashboard sécurisé par PIN. La signature électronique simple (eIDAS) est constituée du tracé manuscrit capturé, de la case d''acceptation cochée, de l''horodatage, de l''adresse IP hashée (SHA-256) et du hash SHA-256 du présent document. Les parties reconnaissent la pleine valeur juridique de cette signature, conformément à l''article 1366 du Code civil.</p>

<h2 style="font-size:16px;margin:24px 0 8px">9. Droit applicable &amp; juridiction</h2>
<p>Le présent contrat est régi par le droit français. Tout litige relèvera de la compétence exclusive des tribunaux de Paris, après tentative de résolution amiable.</p>

<p style="margin-top:32px;color:#888;font-size:12px">Fait le {{date}}, signé électroniquement par {{ambassador_name}}.</p>',
 'J''ai lu l''intégralité du contrat ci-dessus, j''en comprends les termes, et je l''accepte sans réserve. Je reconnais que ma signature électronique a la même valeur juridique qu''une signature manuscrite (article 1367 du Code civil).',
 true)
ON CONFLICT DO NOTHING;
