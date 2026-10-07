-- ============================================================
-- Ambassador email templates: true figures
--
-- The four templates seeded in 00031 had drifted from the programme:
-- the welcome promised 25 € (Solo) and 35 € (Duo) where lib/ambassador-tiers.ts
-- pays 35 € and 45 €, and validated a referral after 2 sales instead of 3;
-- the sales kit quoted statistics nobody could source ("80 € de pourboires
-- perdus par semaine", "70 % des Français") and a price that was not ours.
-- Already applied in production on 7 October 2026; rerunnable.
-- ============================================================

UPDATE ambassador_email_templates SET subject = 'Bienvenue dans le programme ambassadeur, {{first_name}}', body_html = '<p>Salut {{first_name}},</p>
<p>Ton compte ambassadeur est actif. L''essentiel :</p>
<ul>
<li>Ton code : <strong>{{promo_code}}</strong>. Le commerçant le saisit à la commande : c''est ce code qui t''attribue la vente.</li>
<li>Ta commission : <strong>35 €</strong> par pack Solo, <strong>45 €</strong> par pack Duo.</li>
<li>Bonus de la semaine (lundi à dimanche) : +15 € à partir de 5 ventes, +30 € à 8, +50 € à 10. Seul le palier le plus haut compte.</li>
<li>Parrainage : 25 € par ambassadeur parrainé, une fois qu''il a fait 3 ventes. Puis +100 € à 5 filleuls validés, +250 € à 10.</li>
<li>Retrait par virement dès 30 € de solde.</li>
</ul>
<p>Avant ton premier retrait, il faudra ton SIRET et ton compte bancaire : tout se fait depuis ton espace.</p>
<p><a href="{{dashboard_url}}">Ouvrir mon espace ambassadeur</a></p>
<p>Une question ? Réponds à cet e-mail.</p>' WHERE slug = 'welcome';
UPDATE ambassador_email_templates SET subject = 'Tout va bien, {{first_name}} ?', body_html = '<p>Salut {{first_name}},</p>
<p>Aucune vente n''est passée avec ton code <strong>{{promo_code}}</strong> depuis un moment. Si quelque chose bloque (une objection à laquelle tu ne sais pas répondre, une démo qui ne marche pas, un commerçant qui hésite), réponds à cet e-mail : on t''aide dans la journée.</p>
<p>Pour rappel, chaque commerce équipé te rapporte 35 € (Solo) ou 45 € (Duo).</p>
<p><a href="{{dashboard_url}}">Voir mon espace</a></p>' WHERE slug = 'inactivity';
UPDATE ambassador_email_templates SET subject = 'Bravo {{first_name}}, belle semaine', body_html = '<p>Salut {{first_name}},</p>
<p>Belle semaine : merci pour tes ventes. Les paliers de la semaine, pour viser le suivant :</p>
<ul>
<li>5 ventes : +15 €</li>
<li>8 ventes : +30 €</li>
<li>10 ventes : +50 €</li>
</ul>
<p>Seul le palier le plus haut atteint compte, et la semaine va du lundi au dimanche. Quand un défi du mois est en cours, la prime du premier est affichée dans ton espace.</p>
<p><a href="{{dashboard_url}}">Voir mes ventes</a></p>' WHERE slug = 'milestone';
UPDATE ambassador_email_templates SET subject = 'Ton kit pour présenter Digitip, {{first_name}}', body_html = '<p>Salut {{first_name}},</p>
<p>Ce qui marche le mieux pour présenter Digitip à un commerçant :</p>
<p><strong>L''accroche</strong><br>« Vos clients n''ont plus de monnaie, et le pourboire se perd. Avec cette plaque, ils le laissent par carte en deux secondes. »</p>
<p><strong>La démo</strong><br>Pose ta plaque sur le comptoir et fais-la scanner au commerçant avec son téléphone. Il voit la page de pourboire s''ouvrir : c''est l''argument le plus fort.</p>
<p><strong>Les objections</strong></p>
<ul>
<li>« Je n''ai pas le temps » : l''inscription prend quelques minutes, et la plaque n''a besoin de rien d''autre.</li>
<li>« Ça coûte combien ? » : la plaque s''achète une fois, sans abonnement. Le pourboire va en entier à l''établissement : ce sont les clients qui paient les frais de service.</li>
<li>« Mes clients laissent du liquide » : le liquide reste possible, la plaque ajoute la carte pour ceux qui n''en ont pas.</li>
</ul>
<p>Ton code à donner : <strong>{{promo_code}}</strong>.</p>
<p><a href="{{dashboard_url}}">Ouvrir mon espace</a></p>' WHERE slug = 'training';
