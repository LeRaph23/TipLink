export default function Body() {
  return (
    <>
      <p>
        Le problème est simple à énoncer : vos clients n&apos;ont plus de liquide. La carte
        a dépassé les espèces dans les paiements des Français, et la proportion est encore
        plus marquée en café et en restaurant. Le geste du pourboire n&apos;a pas disparu
        parce que les clients sont devenus radins — il a disparu parce qu&apos;ils
        n&apos;ont plus rien dans les poches pour le faire.
      </p>

      <h2>Les trois familles de solutions</h2>

      <h3>1. Le pourboire sur le terminal de paiement</h3>
      <p>
        Le TPE propose un pourcentage au moment de payer. C&apos;est le plus simple à
        déployer si votre terminal le gère déjà.
      </p>
      <p>
        L&apos;inconvénient est social : le client décide sous le regard du serveur, avec
        la file derrière lui. Beaucoup refusent par gêne, ou acceptent en s&apos;agaçant.
        Et l&apos;argent arrive sur le compte de l&apos;établissement, à charge pour lui de
        redistribuer — avec la charge administrative que ça implique.
      </p>

      <h3>2. Le QR code</h3>
      <p>
        Imprimé sur l&apos;addition, un chevalet ou un autocollant. Le client scanne avec
        l&apos;appareil photo, arrive sur une page de paiement, choisit un montant. Coût
        matériel quasi nul.
      </p>
      <p>
        La friction reste réelle : il faut sortir le téléphone, ouvrir l&apos;appareil
        photo, viser, attendre. Chaque étape perd du monde.
      </p>

      <h3>3. Le tag NFC</h3>
      <p>
        Une plaque posée sur le comptoir. Le client approche son téléphone, la page
        s&apos;ouvre, il choisit un montant. Pas d&apos;application à installer, pas de
        visée, pas d&apos;attente : c&apos;est le geste le plus court des trois.
      </p>
      <p>
        La grande majorité des smartphones récents lisent le NFC sans réglage. Pour les
        autres, un QR code imprimé sur la même plaque assure le repli — d&apos;où
        l&apos;intérêt de plaques qui portent les deux.
      </p>

      <h2>La question qui compte : qui reçoit l&apos;argent ?</h2>
      <p>
        C&apos;est le vrai critère de choix, et il est souvent noyé dans les comparatifs
        techniques.
      </p>
      <p>
        <strong>Versement à l&apos;établissement :</strong> vous encaissez, vous
        redistribuez. Cela suppose de tracer, de reverser, et d&apos;assumer la gestion
        d&apos;un flux qui ne vous revient pas.
      </p>
      <p>
        <strong>Versement direct au bénéficiaire :</strong> le client choisit qui il
        récompense, l&apos;argent va sur le compte de cette personne. Vous n&apos;encaissez
        rien, vous ne redistribuez rien. Moins de charge administrative, et un effet de
        motivation plus direct puisque le lien entre le service rendu et la somme perçue
        est visible.
      </p>

      <h2>Ce que ça coûte réellement</h2>
      <p>
        Deux modèles économiques coexistent, et l&apos;écart est important quand on
        démarre.
      </p>
      <p>
        <strong>L&apos;abonnement mensuel</strong> se paie que vous receviez des pourboires
        ou non. Sur un établissement qui teste, ou sur une saison creuse, c&apos;est une
        charge fixe pour rien.
      </p>
      <p>
        <strong>La commission sur les pourboires encaissés</strong> ne coûte rien tant
        qu&apos;il ne se passe rien. Le coût suit l&apos;usage.
      </p>
      <p>
        Regardez aussi ce qui se cache derrière le pourcentage affiché. Les frais bancaires
        du prestataire de paiement s&apos;ajoutent souvent à la commission de la
        plateforme, et sur de petits montants les frais fixes par transaction pèsent plus
        lourd que le pourcentage.
      </p>

      <h2>Comment Digitip se situe</h2>
      <p>
        Digitip est une plaque NFC avec QR code de secours, achetée une fois, sans
        abonnement. Le client choisit le bénéficiaire, la somme part sur le compte bancaire
        de cette personne. La plateforme prélève 5 % sur les pourboires encaissés, plus des
        frais de service fixes par transaction ; sans pourboire, rien n&apos;est dû.
      </p>
      <p>
        Sur un pourboire de 10 €, le client règle 10,25 € : 9,50 € reviennent au
        bénéficiaire, 0,45 € couvrent les frais de paiement Stripe, 0,30 € reviennent à
        Digitip.
      </p>

      <h2>Quand ça ne vaut pas le coup</h2>
      <p>
        Autant le dire : le pourboire dématérialisé ne fonctionne pas partout. Sans moment
        de contact en fin de prestation — vente à emporter, distribution automatique,
        commande sans interaction — il n&apos;y a pas d&apos;occasion naturelle pour le
        geste, et le tag ne sera pas tapé. Le matériel ne crée pas la relation, il ne fait
        que lui rendre un moyen d&apos;expression.
      </p>
    </>
  );
}
