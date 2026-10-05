// Help centre content (/fr/aide): the "I'm stuck here" questions, grouped by
// the moment they happen. FR-only, like the other content hubs.
//
// Every figure below is read from the code, not written from memory. Keep them
// in step when the code changes:
// - email code valid 15 min, resend after 60 s   → lib/auth/otp.ts, auth.codeSentTo
// - activation link valid 7 days                  → lib/auth/onboarding-token.ts
// - team invitation link valid 30 days            → lib/auth/team-join-token.ts
// - tip between 0,50 € and 500 €                  → lib/tips/limits.ts
// - weekly payouts on Monday                      → lib/stripe/connect.ts
// - 10 € tip → 10,75 € charged                    → landing.pricing copy, lib/pricing/tip-fees.ts

export type HelpLink = { label: string; href: string };

export type HelpEntry = {
  id: string;
  question: string;
  /** Short answer, plain text (also used for the FAQPage JSON-LD). */
  answer: string;
  /** Optional numbered steps shown under the answer. */
  steps?: string[];
  link?: HelpLink;
};

export type HelpCategory = { id: string; icon: string; title: string; entries: HelpEntry[] };

export const HELP_CONTACT = 'contact@digitip.app';

export const HELP: HelpCategory[] = [
  {
    id: 'plaque',
    icon: '📦',
    title: 'Ma plaque vient d’arriver',
    entries: [
      {
        id: 'premier-pas',
        question: 'Ma plaque est arrivée : par quoi je commence ?',
        answer:
          "Scannez-la une première fois avec votre téléphone : l'activation s'ouvre toute seule. Quatre écrans, environ une minute.",
        steps: [
          'Approchez le haut de votre téléphone de la plaque, ou scannez son QR code avec l’appareil photo.',
          'Cherchez votre établissement sur Google (ou passez cette étape).',
          'Vérifiez le nom, l’adresse et votre activité.',
          'Indiquez votre nom, puis confirmez votre email avec le code reçu.',
        ],
      },
      {
        id: 'nfc-rien',
        question: 'Rien ne se passe quand j’approche mon téléphone',
        answer:
          "Le NFC demande un téléphone déverrouillé et un contact de quelques secondes. Si ça ne marche toujours pas, le QR code imprimé sur la plaque fait exactement la même chose.",
        steps: [
          'iPhone : déverrouillez l’écran et approchez le haut du téléphone, près de l’appareil photo.',
          'Android : vérifiez que le NFC est activé (Réglages → Appareils connectés → NFC), puis approchez le dos du téléphone.',
          'Retirez une coque épaisse ou métallique si elle gêne.',
          'Sinon, ouvrez l’appareil photo et visez le QR code de la plaque.',
        ],
      },
      {
        id: 'prete-a-activer',
        question: 'Le scan affiche « Votre plaque est prête à être activée » et me demande un email',
        answer:
          "C'est une plaque achetée en ligne. Pour protéger vos pourboires, le lien de configuration est envoyé uniquement à l'adresse utilisée lors de la commande. Touchez « Recevoir mon lien d’activation », puis ouvrez l'email et cliquez sur « Activer ma plaque ».",
        steps: [
          'Regardez aussi dans les spams et l’onglet Promotions.',
          'Vous n’avez plus accès à cette adresse ? Écrivez-nous avec le numéro de commande.',
          '« Trop de demandes » : patientez une heure avant de redemander un lien.',
        ],
      },
      {
        id: 'lien-configurer',
        question: 'J’ai commandé en ligne : où est mon lien « Configurer mon espace » ?',
        answer:
          "Dans l'email de confirmation de commande, et sur la page qui s'affiche juste après le paiement. Le lien est valable 7 jours. Passé ce délai, scannez simplement votre plaque : vous recevrez un nouveau lien par email.",
      },
      {
        id: 'page-introuvable',
        question: 'Le scan affiche « Page introuvable »',
        answer:
          "La plaque n'est pas encore rattachée à un compte, ou le lien a été mal lu. Réessayez avec le QR code. Si le message persiste, écrivez-nous avec une photo de la plaque : nous l'activons avec vous.",
      },
      {
        id: 'activation-interrompue',
        question: 'J’ai fermé l’activation en cours de route',
        answer:
          'Scannez à nouveau la plaque. Sur le même téléphone, vos réponses déjà saisies sont reprises.',
      },
      {
        id: 'pas-sur-google',
        question: 'Mon établissement n’apparaît pas dans la recherche Google',
        answer:
          "Essayez le nom exact affiché sur Google Maps, ou ajoutez la ville. Rien de bloquant : vous pouvez coller votre lien d'avis à la main, ou toucher « Mon établissement n’est pas sur Google » et continuer.",
        steps: [
          'Ouvrez votre fiche dans Google Maps ou Google Business Profile, avec le compte de l’établissement.',
          'Touchez « Demander des avis » : Google affiche un lien du type g.page/r/…/review.',
          'Copiez ce lien et collez-le dans « Saisir le lien manuellement ».',
        ],
      },
    ],
  },
  {
    id: 'connexion',
    icon: '✉️',
    title: 'Connexion et code par email',
    entries: [
      {
        id: 'code-pas-recu',
        question: 'Je ne reçois pas le code à 6 chiffres',
        answer:
          "Il arrive en général en quelques secondes. Vérifiez l'adresse saisie, puis les spams et l'onglet Promotions. Vous pouvez demander un nouveau code au bout de 60 secondes avec « Renvoyer le code ».",
      },
      {
        id: 'code-incorrect',
        question: '« Ce code est incorrect ou expiré »',
        answer:
          'Un code est valable 15 minutes. Utilisez toujours le dernier code reçu : si vous en avez demandé plusieurs, les précédents ne marchent plus.',
      },
      {
        id: 'aucun-compte',
        question: '« Aucun compte avec cette adresse » quand je veux me connecter',
        answer:
          "Votre compte se crée au moment de l'activation de la plaque, pas avant. Vous venez de recevoir votre plaque ? Scannez-la. Vous avez commandé en ligne ? Utilisez le lien « Configurer mon espace » de l'email de confirmation. Sinon, vérifiez l'orthographe de l'adresse.",
      },
      {
        id: 'trop-tentatives',
        question: '« Trop de tentatives »',
        answer: 'Par sécurité, les essais sont limités. Patientez quelques minutes, puis redemandez un code.',
      },
      {
        id: 'mot-de-passe',
        question: 'Quel est mon mot de passe ?',
        answer:
          "Il n'y en a pas. Vous vous connectez avec votre email et un code à 6 chiffres envoyé à chaque fois, depuis n'importe quel téléphone ou ordinateur.",
        link: { label: 'Se connecter', href: '/fr/login' },
      },
    ],
  },
  {
    id: 'paiements',
    icon: '💳',
    title: 'Activer les paiements (Stripe)',
    entries: [
      {
        id: 'pourquoi-verification',
        question: 'Pourquoi dois-je faire une vérification ?',
        answer:
          "La réglementation impose de vérifier l'identité du bénéficiaire avant tout encaissement. C'est fait une seule fois, en environ 2 minutes, dans le formulaire de Stripe (notre partenaire de paiement) intégré à votre tableau de bord. Vos coordonnées bancaires ne transitent jamais par Digitip.",
        link: { label: 'Ouvrir mon compte de paiement', href: '/fr/dashboard/paiements' },
      },
      {
        id: 'documents',
        question: 'Que dois-je avoir sous la main ?',
        answer:
          "Une pièce d'identité du gérant et l'IBAN du compte qui recevra les pourboires. Pour une société, Stripe demande aussi les informations de l'entreprise (SIREN, adresse).",
      },
      {
        id: 'societe-ou-ei',
        question: '« Votre structure juridique » : je choisis quoi ?',
        answer:
          "SAS, SARL, SA… : « Une société ». Micro-entreprise, auto-entreprise ou entreprise individuelle : « Une entreprise individuelle ou auto-entreprise ».",
      },
      {
        id: 'formulaire-ne-charge-pas',
        question: 'Le formulaire de vérification ne s’ouvre pas',
        answer:
          'Rechargez la page. Si le message « Impossible de charger » revient, essayez un autre navigateur ou désactivez temporairement votre bloqueur de publicités. Si Stripe ouvre une fenêtre pour vérifier votre identité, autorisez les fenêtres pop-up pour digitip.app.',
      },
      {
        id: 'verification-incomplete',
        question: 'J’ai commencé la vérification sans la finir',
        answer:
          'Rien n’est perdu. Le bandeau en haut du tableau de bord affiche « Reprendre » : vous continuez là où vous en étiez.',
        link: { label: 'Reprendre la vérification', href: '/fr/dashboard/paiements' },
      },
      {
        id: 'verification-en-cours',
        question: '« Vérification en cours chez Stripe » : je dois faire quelque chose ?',
        answer:
          "Non. Votre page de pourboire s'active toute seule dès que Stripe valide. Si Stripe a besoin d'un document en plus, il apparaît dans « À compléter » sur la page Compte de paiement.",
      },
      {
        id: 'page-fermee',
        question: 'Mes clients voient « Pas encore actif » ou « Aucun membre n’est encore prêt »',
        answer:
          "La page de pourboire reste fermée tant que la vérification de l'établissement n'est pas validée. Une fois validée, elle s'ouvre automatiquement. Vérifiez aussi que votre équipe contient au moins une personne active.",
      },
      {
        id: 'quand-argent',
        question: 'Quand l’argent arrive-t-il sur mon compte ?',
        answer:
          "Les pourboires sont virés par Stripe chaque lundi sur le compte bancaire de l'établissement. Le tout premier virement peut prendre quelques jours de plus, le temps des contrôles de sécurité de Stripe. Le détail est dans « Virements », sur la page Compte de paiement.",
      },
      {
        id: 'reverser-equipe',
        question: 'Comment les employés touchent-ils leurs pourboires ?',
        answer:
          "Le pourboire est versé sur le compte de l'établissement, qui le reverse à la personne choisie par le client, avec la paie. Les relevés mensuels par employé sont prêts à transmettre à votre comptable.",
        link: { label: 'Voir mes relevés', href: '/fr/dashboard/statements' },
      },
      {
        id: 'frais',
        question: 'Combien coûte un pourboire ?',
        answer:
          "Rien pour vous : les frais de service sont payés par le client, et le pourboire choisi vous revient en entier. Exemple : pour un pourboire de 10 €, le client paie 10,75 €.",
      },
      {
        id: 'montants',
        question: 'Y a-t-il un montant minimum ou maximum ?',
        answer: 'Un pourboire va de 0,50 € à 500 €. Les montants proposés par défaut se règlent dans Paramètres.',
        link: { label: 'Paramètres', href: '/fr/dashboard/settings' },
      },
      {
        id: 'remboursement',
        question: 'Un client s’est trompé de montant ou demande un remboursement',
        answer: `Écrivez-nous à ${HELP_CONTACT} avec la date, l'heure et le montant du pourboire : nous nous en occupons.`,
      },
    ],
  },
  {
    id: 'equipe',
    icon: '👥',
    title: 'Ajouter mon équipe',
    entries: [
      {
        id: 'ajouter',
        question: 'Comment ajouter un serveur ou un coiffeur ?',
        answer:
          'Le plus simple : envoyez le lien d’invitation de votre équipe par SMS ou WhatsApp. Chacun crée son profil depuis son téléphone (prénom, photo, email) en 2 minutes. Vous pouvez aussi inviter quelqu’un par email avec « Inviter un membre ».',
        steps: [
          'Tableau de bord → Équipe.',
          'Touchez « Copier le lien » ou « Copier le SMS ».',
          'Envoyez-le à votre employé : il ouvre le lien et suit les étapes.',
        ],
        link: { label: 'Ouvrir mon équipe', href: '/fr/dashboard/staff' },
      },
      {
        id: 'lien-ne-marche-pas',
        question: 'Mon employé dit que le lien d’invitation ne marche pas',
        answer:
          "Le lien d'équipe est valable 30 jours. S'il a été régénéré entre-temps, l'ancien ne fonctionne plus. Recopiez le lien actuel depuis la page Équipe et renvoyez-le.",
      },
      {
        id: 'email-invitation',
        question: 'Mon employé n’a pas reçu l’email d’invitation',
        answer:
          "Demandez-lui de regarder dans ses spams. Le plus rapide reste de lui envoyer le lien d'équipe par SMS : il n'a pas besoin de l'email pour s'inscrire.",
      },
      {
        id: 'lien-partage',
        question: 'J’ai partagé le lien d’invitation par erreur',
        answer:
          'Sur la page Équipe, touchez « Régénérer le lien » : tous les liens déjà partagés deviennent inutilisables, et un nouveau lien est créé.',
      },
      {
        id: 'membre-absent',
        question: 'Un membre n’apparaît pas sur la page de pourboire',
        answer:
          "Vérifiez que la vérification Stripe de l'établissement est validée (sinon la page est fermée pour tout le monde) et que la personne est bien « Active » dans la liste Équipe.",
      },
      {
        id: 'modifier-profil',
        question: 'Corriger un prénom ou changer une photo',
        answer:
          'Équipe → « Voir » sur la ligne de la personne → modifiez le prénom ou la photo → « Enregistrer ». C’est ce que verront les clients sur la page de pourboire.',
      },
      {
        id: 'depart',
        question: 'Un employé quitte l’établissement',
        answer:
          "Équipe → « Voir » → « Retirer de l’équipe ». Il disparaît de la page de pourboire, mais son historique reste dans vos relevés. Si des paiements le concernant sont encore en attente, réessayez une fois qu'ils sont réglés.",
      },
      {
        id: 'moi-aussi',
        question: 'Je suis gérant : puis-je recevoir des pourboires moi aussi ?',
        answer: 'Oui. Sur la page Équipe, touchez « M’ajouter à l’équipe » : vous apparaissez dans la liste comme les autres.',
      },
    ],
  },
  {
    id: 'plaques',
    icon: '🏷️',
    title: 'Plaques et établissements',
    entries: [
      {
        id: 'deplacer',
        question: 'Changer une plaque d’établissement',
        answer: "Tableau de bord → Plaques : choisissez l'établissement dans le menu de la ligne de la plaque.",
        link: { label: 'Mes plaques', href: '/fr/dashboard/stickers' },
      },
      {
        id: 'plusieurs-etablissements',
        question: 'J’ai plusieurs établissements',
        answer:
          'Un seul compte suffit. Tableau de bord → Établissements → « Nouvel établissement ». Chacun a ses propres plaques, son équipe et ses statistiques.',
        link: { label: 'Mes établissements', href: '/fr/dashboard/establishments' },
      },
      {
        id: 'commander',
        question: 'Commander d’autres plaques',
        answer: 'Tableau de bord → Facturation → Commander. Elles sont programmées à la main et expédiées sous 3 jours ouvrés.',
        link: { label: 'Facturation', href: '/fr/dashboard/billing' },
      },
      {
        id: 'cassee',
        question: 'Ma plaque est cassée, abîmée ou perdue',
        answer: `Le matériel est garanti à vie. Écrivez-nous à ${HELP_CONTACT} avec une photo (ou le numéro de commande) : nous vous en envoyons une nouvelle.`,
      },
      {
        id: 'ou-poser',
        question: 'Où poser la plaque pour qu’elle marche bien ?',
        answer:
          "Là où le client la voit au moment de régler : comptoir, caisse, table, porte-addition. Évitez de la coller directement sur du métal, qui peut gêner la lecture NFC. Le QR code, lui, fonctionne partout.",
      },
      {
        id: 'qr-imprimer',
        question: 'Imprimer mon QR code (menu, vitrine, addition)',
        answer: "Tableau de bord → Plaques → bouton « QR » sur la ligne de la plaque : le fichier se télécharge, prêt à imprimer.",
      },
    ],
  },
  {
    id: 'google',
    icon: '⭐',
    title: 'Avis Google',
    entries: [
      {
        id: 'relier-apres',
        question: 'Relier ma fiche Google après l’activation',
        answer: "Tableau de bord → Établissements → votre établissement → « Lien d’avis Google ».",
        link: { label: 'Mes établissements', href: '/fr/dashboard/establishments' },
      },
      {
        id: 'avis-invisible',
        question: 'Mon lien Google est enregistré mais mes clients ne voient rien',
        answer:
          "L'invitation à laisser un avis juste après le pourboire fait partie de Digitip Pro, offert 30 jours dès votre premier pourboire, sans carte. Après l'essai, le lien reste enregistré et l'invitation revient dès que Pro est réactivé. Les pourboires et les relevés, eux, fonctionnent sans abonnement.",
        link: { label: 'Voir Digitip Pro', href: '/fr/dashboard/billing' },
      },
    ],
  },
];

export const HELP_ENTRIES = HELP.flatMap((c) => c.entries);
