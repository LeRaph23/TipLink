-- Add a "Matériel de démonstration et flyers" clause to the seeded ambassador
-- contract template.
--
-- The Société provides each ambassador with free promotional flyers and one
-- demo SmartTag. The demo SmartTag is handed over against a 10 € deposit that
-- is refunded once the unit is returned in working condition.
--
-- This is inserted as Article 2, so the subsequent articles (2→3 … 9→10) are
-- renumbered. Updating the template body only affects contracts sent AFTER
-- this migration: already-sent and signed contracts keep their own immutable
-- content_snapshot, so no existing contract is altered.

UPDATE public.ambassador_contract_templates
SET
  body_html = '<h1 style="font-size:22px;margin:0 0 8px">Contrat d''apporteur d''affaires — Digitip</h1>
<p style="color:#666;font-size:13px;margin:0 0 24px">Entre Digitip (« la Société ») et {{ambassador_name}} (« l''Ambassadeur »), SIRET {{ambassador_siret}}.</p>

<h2 style="font-size:16px;margin:24px 0 8px">1. Objet</h2>
<p>L''Ambassadeur s''engage à promouvoir les produits SmartTag NFC de Digitip auprès d''établissements de coiffure, beauté et restauration, en utilisant son code promo personnel <strong>{{promo_code}}</strong>. Aucune exclusivité territoriale n''est accordée.</p>

<h2 style="font-size:16px;margin:24px 0 8px">2. Matériel de démonstration et flyers</h2>
<p>Pour soutenir sa démarche commerciale, la Société remet gratuitement à l''Ambassadeur des flyers promotionnels ainsi qu''un (1) SmartTag de démonstration. Les flyers ne sont soumis à aucune caution et n''ont pas à être restitués. Le SmartTag de démonstration est remis contre une caution de 10 €. Cette caution est intégralement restituée à l''Ambassadeur dès la réception par la Société du SmartTag de démonstration renvoyé en état de fonctionnement. En cas de non-restitution ou de détérioration du SmartTag de démonstration, la caution reste acquise à la Société à titre d''indemnisation.</p>

<h2 style="font-size:16px;margin:24px 0 8px">3. Statut</h2>
<p>L''Ambassadeur intervient en qualité d''apporteur d''affaires indépendant. Il n''a en aucun cas la qualité de salarié, d''agent commercial ou de mandataire de la Société. Il déclare disposer d''un statut juridique l''autorisant à percevoir des commissions (auto-entrepreneur, micro-entreprise ou équivalent) et atteste sur l''honneur être à jour de ses obligations fiscales et sociales.</p>

<h2 style="font-size:16px;margin:24px 0 8px">4. Commissions</h2>
<p>L''Ambassadeur perçoit, pour chaque commande SmartTag confirmée et payée via son code promo :</p>
<ul>
  <li>25 € HT par pack Solo (1 SmartTag)</li>
  <li>35 € HT par pack Duo (2 SmartTags)</li>
</ul>
<p>Des bonus hebdomadaires peuvent s''ajouter selon le nombre de ventes réalisées sur la semaine calendaire (lundi-dimanche). Les conditions des bonus sont consultables dans le dashboard ambassadeur et peuvent être modifiées avec un préavis de 14 jours.</p>

<h2 style="font-size:16px;margin:24px 0 8px">5. Versement des commissions</h2>
<p>Les commissions sont versées par virement Stripe Connect sur le compte bancaire que l''Ambassadeur aura renseigné, sous réserve d''un solde minimum de 30 €. Les paiements sont effectués chaque vendredi sur demande de l''Ambassadeur depuis son dashboard.</p>

<h2 style="font-size:16px;margin:24px 0 8px">6. Obligations de l''Ambassadeur</h2>
<ul>
  <li>Ne pas démarcher de manière trompeuse, agressive ou contraire aux dispositions du Code de la consommation.</li>
  <li>Ne pas se présenter comme employé ou représentant exclusif de Digitip.</li>
  <li>Ne pas générer de fausses ventes ni de transactions frauduleuses sous peine de résiliation immédiate et de restitution des commissions perçues.</li>
  <li>Restituer le SmartTag de démonstration en état de fonctionnement sur demande de la Société ou à la fin du contrat.</li>
  <li>Respecter la confidentialité des informations commerciales reçues.</li>
</ul>

<h2 style="font-size:16px;margin:24px 0 8px">7. Durée &amp; résiliation</h2>
<p>Le présent contrat est conclu pour une durée indéterminée à compter de sa signature électronique. Chaque partie peut y mettre fin à tout moment, par simple email, avec effet immédiat. Les commissions dues au titre des ventes réalisées avant la résiliation restent dues.</p>

<h2 style="font-size:16px;margin:24px 0 8px">8. Données personnelles (RGPD)</h2>
<p>Digitip collecte les données personnelles de l''Ambassadeur (nom, email, téléphone, SIRET, IBAN) aux seules fins de la gestion de la relation commerciale, du versement des commissions et du respect des obligations légales. Ces données sont conservées 5 ans après la fin du contrat. L''Ambassadeur dispose d''un droit d''accès, de rectification et d''effacement en écrivant à privacy@digitip.app.</p>

<h2 style="font-size:16px;margin:24px 0 8px">9. Signature électronique</h2>
<p>Le présent contrat est signé électroniquement par l''Ambassadeur depuis son dashboard sécurisé par PIN. La signature électronique simple (eIDAS) est constituée du tracé manuscrit capturé, de la case d''acceptation cochée, de l''horodatage, de l''adresse IP hashée (SHA-256) et du hash SHA-256 du présent document. Les parties reconnaissent la pleine valeur juridique de cette signature, conformément à l''article 1366 du Code civil.</p>

<h2 style="font-size:16px;margin:24px 0 8px">10. Droit applicable &amp; juridiction</h2>
<p>Le présent contrat est régi par le droit français. Tout litige relèvera de la compétence exclusive des tribunaux de Paris, après tentative de résolution amiable.</p>

<p style="margin-top:32px;color:#888;font-size:12px">Fait le {{date}}, signé électroniquement par {{ambassador_name}}.</p>',
  updated_at = now()
WHERE name = 'Contrat d''ambassadeur Digitip v1'
  AND version = 1;
