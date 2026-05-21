-- Commerciaux Pros — contracts infrastructure (e-signed apporteur d'affaires
-- agreements). Mirrors the ambassador setup from 00031/00032 but with a B2B
-- contract template carrying the 50/65 € grid and substantially stronger
-- protective clauses (data ownership, non-solicitation, fraud penalties,
-- anti-disguised-employment carve-outs).

-- ─── Templates ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_contract_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  version        int  NOT NULL DEFAULT 1,
  body_html      text NOT NULL,
  consent_text   text NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── Contracts (per-commercial instances) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_contracts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_id         uuid NOT NULL REFERENCES public.commerciaux(id) ON DELETE CASCADE,
  template_id           uuid REFERENCES public.commercial_contract_templates(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_commercial_contracts_commercial
  ON public.commercial_contracts(commercial_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_commercial_contracts_status
  ON public.commercial_contracts(status);

-- Immutability: once signed, no further modifications.
CREATE OR REPLACE FUNCTION public.enforce_signed_commercial_contract_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'Signed commercial contracts are immutable (contract_id=%)', OLD.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_commercial_contracts_immutable ON public.commercial_contracts;
CREATE TRIGGER trg_commercial_contracts_immutable
  BEFORE UPDATE ON public.commercial_contracts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_signed_commercial_contract_immutability();

CREATE OR REPLACE FUNCTION public.forbid_signed_commercial_contract_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'Signed commercial contracts cannot be deleted';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_commercial_contracts_no_delete_signed ON public.commercial_contracts;
CREATE TRIGGER trg_commercial_contracts_no_delete_signed
  BEFORE DELETE ON public.commercial_contracts
  FOR EACH ROW EXECUTE FUNCTION public.forbid_signed_commercial_contract_delete();

-- ─── Audit log (append-only) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_contract_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   uuid NOT NULL REFERENCES public.commercial_contracts(id) ON DELETE CASCADE,
  action        text NOT NULL CHECK (action IN ('sent','viewed','signed','revoked','downloaded')),
  actor_type    text NOT NULL CHECK (actor_type IN ('admin','commercial','system')),
  actor_id      text,
  ip_hash       text,
  user_agent    text,
  details       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commercial_contract_audit_contract
  ON public.commercial_contract_audit_log(contract_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.forbid_commercial_contract_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'commercial_contract_audit_log is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_commercial_contract_audit_no_mutate ON public.commercial_contract_audit_log;
CREATE TRIGGER trg_commercial_contract_audit_no_mutate
  BEFORE UPDATE OR DELETE ON public.commercial_contract_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.forbid_commercial_contract_audit_mutation();

ALTER FUNCTION public.enforce_signed_commercial_contract_immutability() SET search_path = '';
ALTER FUNCTION public.forbid_signed_commercial_contract_delete()        SET search_path = '';
ALTER FUNCTION public.forbid_commercial_contract_audit_mutation()       SET search_path = '';

-- ─── RLS — super-admin only (commercial-side access via service client) ─────
ALTER TABLE public.commercial_contract_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_contracts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_contract_audit_log  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commercial_contract_templates_super_admin_all"
  ON public.commercial_contract_templates
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "commercial_contracts_super_admin_all"
  ON public.commercial_contracts
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "commercial_contract_audit_log_super_admin_all"
  ON public.commercial_contract_audit_log
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── Private bucket for signature PNGs ──────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'commercial-signatures',
  'commercial-signatures',
  false,
  524288,
  ARRAY['image/png']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- ─── Seeded contract template (production-grade, B2B-protective) ────────────
INSERT INTO public.commercial_contract_templates (name, version, body_html, consent_text, is_active) VALUES
('Contrat d''apporteur d''affaires — Commerciaux Pros Digitip v1', 1,
$body$<h1 style="font-size:22px;margin:0 0 6px">Contrat d'apporteur d'affaires — Commerciaux Pros</h1>
<p style="color:#555;font-size:12.5px;margin:0 0 22px">Référence&nbsp;: <strong>CAP-CPRO-{{contract_short_id}}</strong> · Fait à Petit-Landau, le {{date}}.</p>

<h2 style="font-size:15px;margin:24px 0 6px">Entre les soussignés</h2>
<p style="font-size:13.5px">
  <strong>YUZU LABS</strong>, société par actions simplifiée au capital de 100&nbsp;€, immatriculée au RCS de Mulhouse sous le numéro SIREN 994&nbsp;879&nbsp;013, dont le siège social est sis 11 rue de Lorraine, 68490 Petit-Landau, France, exploitant la marque « Digitip »,
  <br/>ci-après dénommée la « <strong>Société</strong> », d'une part,
</p>
<p style="font-size:13.5px">
  Et <strong>{{commercial_name}}</strong>, exerçant sous la forme juridique de <strong>{{legal_form_label}}</strong>, dont la raison sociale est <strong>{{company_name}}</strong>, immatriculé(e) sous le SIRET&nbsp;<strong>{{siret}}</strong>{{vat_clause}}, dont l'établissement est sis à {{city}}, agissant en qualité de <strong>{{vrp_status_label}}</strong>,
  <br/>ci-après dénommé(e) le « <strong>Commercial</strong> », d'autre part.
</p>
<p style="font-size:13.5px">Ensemble, les « <strong>Parties</strong> ».</p>

<h2 style="font-size:15px;margin:24px 0 6px">Préambule</h2>
<p style="font-size:13.5px">La Société édite, commercialise et opère la solution Digitip, dispositif de pourboire sans contact reposant sur des étiquettes NFC (« <strong>SmartTags</strong> ») destinées aux établissements de coiffure, esthétique, restauration et autres commerces de proximité. La Société souhaite confier au Commercial une mission d'apport d'affaires consistant à présenter les SmartTags à de tels commerces et à favoriser leur acquisition.</p>

<h2 style="font-size:15px;margin:24px 0 6px">Article 1 — Objet</h2>
<p style="font-size:13.5px">Le présent contrat (le « <strong>Contrat</strong> ») a pour objet de définir les conditions dans lesquelles le Commercial, agissant à titre indépendant, exercera une mission d'apport d'affaires au bénéfice de la Société, en présentant les SmartTags Digitip à des prospects qualifiés et en facilitant leur acquisition au moyen du code promotionnel personnel <strong>{{promo_code}}</strong> qui lui est attribué.</p>
<p style="font-size:13.5px">Aucune exclusivité territoriale n'est consentie au Commercial. La Société conserve la faculté de prospecter directement, par tout autre canal, et de confier des missions équivalentes à tout autre apporteur d'affaires.</p>

<h2 style="font-size:15px;margin:24px 0 6px">Article 2 — Qualification juridique et indépendance</h2>
<p style="font-size:13.5px">Le Commercial intervient en qualité d'<strong>apporteur d'affaires indépendant</strong>. Le présent Contrat ne constitue ni un contrat de travail, ni un contrat d'agent commercial au sens des articles L.&nbsp;134-1 et suivants du Code de commerce, ni un mandat. Aucun lien de subordination juridique n'existe entre les Parties&nbsp;: le Commercial organise librement son activité, ses horaires, ses moyens et sa clientèle, sous sa seule responsabilité.</p>
<p style="font-size:13.5px">Le Commercial déclare et garantit&nbsp;: (i) être dûment immatriculé sous le statut juridique mentionné ci-dessus&nbsp;; (ii) être à jour de l'ensemble de ses obligations sociales, fiscales et déclaratives&nbsp;; (iii) disposer de toutes les autorisations nécessaires à l'exercice de la présente mission&nbsp;; (iv) souscrire toute assurance professionnelle requise par son statut. Toute évolution de sa situation juridique ou fiscale sera notifiée à la Société sans délai.</p>
<p style="font-size:13.5px">Le Commercial s'interdit, en toutes circonstances, de se prévaloir de la qualité de salarié, agent, employé, mandataire ou représentant de la Société et de tout pouvoir d'engagement à son égard.</p>

<h2 style="font-size:15px;margin:24px 0 6px">Article 3 — Mission</h2>
<p style="font-size:13.5px">Dans le cadre de sa mission, le Commercial s'engage à&nbsp;:</p>
<ol style="font-size:13.5px;padding-left:20px;margin:6px 0">
  <li>identifier des commerces de proximité susceptibles d'acquérir un ou plusieurs SmartTags&nbsp;;</li>
  <li>présenter loyalement et de manière conforme à l'image de la Société les caractéristiques, fonctionnalités et tarifs des SmartTags&nbsp;;</li>
  <li>remettre au prospect son code promotionnel personnel <strong>{{promo_code}}</strong> en vue de la passation de commande sur la plateforme officielle de la Société&nbsp;;</li>
  <li>s'abstenir de toute négociation tarifaire dérogatoire et de tout engagement contractuel pour le compte de la Société.</li>
</ol>
<p style="font-size:13.5px">L'achat est conclu directement entre la Société et le commerce client. Le Commercial n'intervient à aucun stade du contrat de vente, ni de son exécution, ni du service après-vente.</p>

<h2 style="font-size:15px;margin:24px 0 6px">Article 4 — Rémunération</h2>
<p style="font-size:13.5px">En contrepartie de chaque vente <em>confirmée et intégralement payée</em> à la Société au moyen du code promotionnel personnel du Commercial, ce dernier perçoit une commission d'apport d'affaires forfaitaire, calculée hors taxes&nbsp;:</p>
<ul style="font-size:13.5px;padding-left:20px;margin:6px 0">
  <li><strong>50,00 € HT</strong> par <strong>Pack Solo</strong> (1 SmartTag)&nbsp;;</li>
  <li><strong>65,00 € HT</strong> par <strong>Pack Duo</strong> (2 SmartTags).</li>
</ul>
<p style="font-size:13.5px">La commission est acquise au Commercial dès l'encaissement effectif de la commande par la Société. Elle est <strong>définitivement perdue</strong> en cas&nbsp;: (a) de remboursement total ou partiel de la commande&nbsp;; (b) de rétrofacturation ou litige bancaire (chargeback)&nbsp;; (c) d'annulation de la commande avant expédition&nbsp;; (d) de fraude avérée, telle que définie à l'article 7.</p>
<p style="font-size:13.5px">La Société se réserve le droit de faire évoluer le barème pour les ventes futures, avec un préavis écrit de <strong>30 jours</strong> notifié au Commercial. Les ventes intervenues avant l'entrée en vigueur du nouveau barème demeurent rémunérées selon les conditions antérieures.</p>

<h2 style="font-size:15px;margin:24px 0 6px">Article 5 — Facturation et règlement</h2>
<p style="font-size:13.5px">Le Commercial adresse à la Société une facture mensuelle (ou, sur option, trimestrielle) reprenant l'ensemble des commissions de la période. Cette facture est émise depuis l'espace commercial personnel mis à disposition par la Société ou, à défaut, transmise par voie électronique à&nbsp;: comptabilite@digitip.app.</p>
<p style="font-size:13.5px">Lorsque le Commercial est assujetti à la TVA, celle-ci est appliquée au taux en vigueur. À défaut, la facture mentionnera expressément&nbsp;: « TVA non applicable, article 293 B du CGI ». Le Commercial est seul responsable de la régularité fiscale de ses factures.</p>
<p style="font-size:13.5px">Le règlement intervient par virement bancaire via Stripe Connect, sur le compte renseigné par le Commercial, sous réserve d'un solde minimum de <strong>30 €</strong> et sur déclenchement par le Commercial depuis son espace personnel. Les fonds sont créditables sous 1 à 5 jours ouvrés à compter de la demande, après vérification anti-fraude éventuelle.</p>

<h2 style="font-size:15px;margin:24px 0 6px">Article 6 — Obligations du Commercial</h2>
<p style="font-size:13.5px">Le Commercial s'engage, pendant toute la durée du Contrat&nbsp;:</p>
<ul style="font-size:13.5px;padding-left:20px;margin:6px 0">
  <li>à n'employer que des méthodes de démarchage loyales et conformes aux dispositions du Code de la consommation, notamment des articles L.&nbsp;121-1 et suivants relatifs aux pratiques commerciales déloyales&nbsp;;</li>
  <li>à respecter scrupuleusement la marque, l'identité visuelle, les supports et l'image commerciale de la Société, et à n'utiliser que les éléments mis à sa disposition par celle-ci&nbsp;;</li>
  <li>à ne pas se présenter comme employé, agent exclusif ou représentant légal de la Société&nbsp;;</li>
  <li>à ne pas modifier, altérer, traduire ou diffuser sans autorisation écrite préalable les supports commerciaux fournis&nbsp;;</li>
  <li>à respecter la réglementation applicable au démarchage à domicile, à la prospection téléphonique (loi du 24 juillet 2020, dispositif Bloctel) et à la prospection électronique (RGPD)&nbsp;;</li>
  <li>à informer sans délai la Société de toute réclamation, contentieux ou difficulté qu'il rencontrerait dans l'exécution de sa mission.</li>
</ul>

<h2 style="font-size:15px;margin:24px 0 6px">Article 7 — Engagement anti-fraude</h2>
<p style="font-size:13.5px">Le Commercial s'interdit expressément&nbsp;:</p>
<ul style="font-size:13.5px;padding-left:20px;margin:6px 0">
  <li>d'utiliser son propre code promotionnel pour ses besoins personnels ou ceux d'une entité qu'il contrôle&nbsp;;</li>
  <li>de mettre en place des ventes de complaisance avec un proche, un associé, un client préexistant de la Société ou tout tiers ayant pour seule finalité l'obtention de commissions&nbsp;;</li>
  <li>de transmettre son code promotionnel à un tiers en vue d'une telle utilisation&nbsp;;</li>
  <li>de manipuler, en toutes circonstances, le système d'attribution des ventes mis en place par la Société.</li>
</ul>
<p style="font-size:13.5px">En cas de manquement avéré, et indépendamment de toute autre voie de droit, la Société pourra&nbsp;: (i) suspendre immédiatement le versement des commissions impayées&nbsp;; (ii) exiger le <strong>remboursement intégral</strong> des commissions versées en lien avec les opérations frauduleuses, majorées d'intérêts au taux légal&nbsp;; (iii) résilier le Contrat de plein droit, sans préavis ni indemnité, conformément à l'article 11&nbsp;; (iv) engager toute action en réparation des préjudices subis (atteinte à l'image, frais d'enquête, perte d'exploitation).</p>

<h2 style="font-size:15px;margin:24px 0 6px">Article 8 — Confidentialité</h2>
<p style="font-size:13.5px">Le Commercial s'engage à conserver strictement confidentielles toutes informations relatives à la Société, à ses clients, à ses prospects, à ses outils, méthodes, stratégies commerciales et tarifs non publics, dont il aurait connaissance dans le cadre du présent Contrat. Cet engagement perdure pendant <strong>cinq (5) ans</strong> à compter de la cessation du Contrat, quelle qu'en soit la cause.</p>
<p style="font-size:13.5px">Toute violation de la présente clause exposera le Commercial à des dommages-intérêts dont le montant ne pourra être inférieur aux préjudices effectivement subis par la Société.</p>

<h2 style="font-size:15px;margin:24px 0 6px">Article 9 — Propriété de la base prospects et clients</h2>
<p style="font-size:13.5px">Toute donnée concernant un prospect ou un client de la Société, qu'elle ait été collectée par le Commercial dans le cadre de sa mission ou mise à sa disposition par la Société, demeure la <strong>propriété exclusive</strong> de la Société. Le Commercial ne dispose d'aucun droit d'usage, d'exploitation, de cession, de diffusion ou de conservation de ces données au-delà de ce qui est strictement nécessaire à l'exécution du présent Contrat.</p>
<p style="font-size:13.5px">À la cessation du Contrat, le Commercial s'engage à restituer ou détruire, sur simple demande écrite de la Société, l'ensemble des données, fichiers, listes et supports comportant de telles informations.</p>

<h2 style="font-size:15px;margin:24px 0 6px">Article 10 — Non-sollicitation post-contractuelle</h2>
<p style="font-size:13.5px">Pendant une durée de <strong>douze (12) mois</strong> à compter de la cessation du Contrat, le Commercial s'interdit, directement ou indirectement, de solliciter activement (i) les clients de la Société qu'il aurait connus à l'occasion de l'exécution du présent Contrat, ou (ii) ses prospects en cours d'instruction, en vue de leur proposer une offre concurrente du dispositif SmartTag.</p>
<p style="font-size:13.5px">La présente clause, limitée dans son objet, sa durée et sa portée géographique (territoire national français), est consentie sans contrepartie financière compte tenu de l'absence d'exclusivité accordée au Commercial pendant l'exécution du Contrat. Elle ne fait pas obstacle à la libre exercice par le Commercial de toute autre activité commerciale n'entrant pas en concurrence directe avec les SmartTags Digitip.</p>

<h2 style="font-size:15px;margin:24px 0 6px">Article 11 — Durée et résiliation</h2>
<p style="font-size:13.5px">Le Contrat est conclu pour une <strong>durée indéterminée</strong> à compter de sa signature électronique.</p>
<p style="font-size:13.5px"><em>Résiliation à l'initiative de l'une des Parties</em>&nbsp;: chaque Partie peut y mettre fin à tout moment, sans avoir à justifier d'un motif, moyennant un préavis écrit de <strong>trente (30) jours</strong> notifié par tout moyen écrit conférant date certaine (lettre recommandée ou email avec accusé de réception). Les commissions afférentes aux ventes confirmées et payées avant la date d'effet de la résiliation restent dues.</p>
<p style="font-size:13.5px"><em>Résiliation pour faute</em>&nbsp;: en cas de manquement grave d'une Partie à ses obligations (notamment fraude au sens de l'article 7, violation de la confidentialité, atteinte à l'image de la Société), la Partie non défaillante pourra résilier le Contrat de plein droit, sans préavis ni indemnité, par lettre recommandée avec accusé de réception, après mise en demeure restée infructueuse pendant huit (8) jours. La résiliation pour fraude n'est subordonnée à aucune mise en demeure préalable.</p>

<h2 style="font-size:15px;margin:24px 0 6px">Article 12 — Données personnelles (RGPD)</h2>
<p style="font-size:13.5px">La Société, en qualité de responsable de traitement, collecte les données personnelles du Commercial (nom, raison sociale, SIRET, numéro de TVA, email, téléphone, ville, RIB) aux fins exclusives de la gestion administrative et comptable du présent Contrat, du versement des commissions, du respect des obligations légales (notamment fiscales et anti-blanchiment) et de la sécurité du dispositif. La base légale du traitement est l'exécution du présent Contrat (RGPD art.&nbsp;6 §1 b) et le respect d'obligations légales (RGPD art.&nbsp;6 §1 c).</p>
<p style="font-size:13.5px">Les données sont conservées pendant la durée du Contrat puis pendant cinq (5) ans à compter de sa cessation au titre de la prescription commerciale, et dix (10) ans pour les données comptables au titre de l'article L.&nbsp;123-22 du Code de commerce. Le Commercial dispose d'un droit d'accès, de rectification, d'effacement, de limitation, de portabilité et d'opposition, qu'il peut exercer en écrivant à privacy@digitip.app. Réclamation possible auprès de la CNIL.</p>

<h2 style="font-size:15px;margin:24px 0 6px">Article 13 — Signature électronique</h2>
<p style="font-size:13.5px">Les Parties conviennent expressément que le présent Contrat est conclu sous forme électronique. Sa signature s'effectue via la plateforme sécurisée par code PIN du Commercial, par apposition du tracé manuscrit capturé numériquement, validation explicite de la clause de consentement, horodatage, conservation de l'adresse IP hashée (algorithme SHA-256) et de l'empreinte cryptographique SHA-256 du présent document.</p>
<p style="font-size:13.5px">La présente signature constitue une signature électronique simple au sens du règlement (UE) n°&nbsp;910/2014 du 23 juillet 2014 (« eIDAS ») et lui confère, par accord exprès des Parties, la même force probante qu'une signature manuscrite conformément aux articles 1366 et 1367 du Code civil français.</p>

<h2 style="font-size:15px;margin:24px 0 6px">Article 14 — Modifications</h2>
<p style="font-size:13.5px">Toute modification du présent Contrat fait l'objet d'un avenant écrit signé par les deux Parties. Par exception, l'évolution du barème de commissions visée à l'article 4 et celle des conditions du dispositif (interfaces, mode opératoire, bonus éventuels) peuvent être notifiées unilatéralement par la Société, moyennant un préavis écrit de trente (30) jours, étant entendu que le Commercial conserve la faculté de résilier le Contrat dans ce délai s'il n'accepte pas les nouvelles conditions.</p>

<h2 style="font-size:15px;margin:24px 0 6px">Article 15 — Tolérance, divisibilité, intégralité</h2>
<p style="font-size:13.5px">Le fait pour l'une des Parties de ne pas se prévaloir d'un manquement de l'autre ne saurait s'interpréter comme une renonciation à s'en prévaloir ultérieurement. Si l'une quelconque des stipulations du présent Contrat venait à être déclarée nulle ou inapplicable, les autres stipulations conserveraient leur plein effet. Le présent Contrat, son préambule et ses annexes éventuelles constituent l'intégralité de l'accord des Parties.</p>

<h2 style="font-size:15px;margin:24px 0 6px">Article 16 — Droit applicable et juridiction</h2>
<p style="font-size:13.5px">Le présent Contrat est soumis au droit français. En cas de différend relatif à sa formation, son interprétation, son exécution ou sa résiliation, les Parties s'efforceront de rechercher une solution amiable préalable. À défaut, et conformément à l'article 48 du Code de procédure civile, <strong>tout litige sera soumis à la compétence exclusive des tribunaux du ressort de la Cour d'appel de Colmar</strong>, nonobstant pluralité de défendeurs ou appel en garantie.</p>

<div style="margin-top:36px;padding-top:18px;border-top:1px solid #ddd;font-size:12.5px;color:#444">
  <p style="margin:0 0 6px"><strong>Fait à Petit-Landau, le {{date}}.</strong></p>
  <p style="margin:0">Le présent Contrat est signé électroniquement par le Commercial <strong>{{commercial_name}}</strong>, agissant pour le compte de <strong>{{company_name}}</strong>, et par la Société YUZU LABS, représentée par son représentant légal.</p>
</div>$body$,
$consent$Je reconnais avoir lu l'intégralité du présent Contrat d'apporteur d'affaires, en comprendre les termes et les accepter sans réserve. J'accepte expressément que ma signature électronique simple ait la même valeur juridique qu'une signature manuscrite (articles 1366 et 1367 du Code civil français ; règlement eIDAS UE n° 910/2014).$consent$,
 true)
ON CONFLICT DO NOTHING;
