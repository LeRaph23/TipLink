import type { SolutionMeta } from '@/content/types';

// One URL per trade, serving both the SEO query and the conversion pitch.
// Deliberately not split into "SEO page" + "landing page": two pages about the
// same trade on the same domain cannibalise each other and divide link equity,
// and a new domain has no authority to spend winning twice.
//
// Quality bar: each page carries genuinely trade-specific content — the tipping
// norm in that trade, typical amounts, whether the 2026 exemption reaches their
// staff, a concrete revenue table, real objections. A template with the noun
// swapped is exactly the thin-content line, so a trade only ships once there is
// something real to say about it.

export const SOLUTIONS: SolutionMeta[] = [
  {
    slug: 'restaurant',
    trade: 'Restaurant',
    tradePlural: 'les restaurants',
    title: 'Pourboire par carte pour restaurant',
    description:
      "Vos clients paient par carte et ne laissent plus rien. Comment remettre le pourboire dans le parcours, ce que ça rapporte à votre salle, et ce que ça vous coûte.",
    h1: 'Le pourboire par carte, pour les restaurants',
    cardSummary:
      "Service en salle, forte fréquence, culture du pourboire installée : le métier où le passage à la carte a fait le plus de dégâts.",
    datePublished: '2026-07-27',
    dateModified: '2026-07-27',
    related: ['bar', 'cafe'],
    faq: [
      {
        question: 'Est-ce que ça remplace le pourboire en espèces ?',
        answer:
          "Ça le complète. Les clients qui ont du liquide continuent d'en laisser ; les autres, qui sont désormais la majorité, retrouvent simplement la possibilité de le faire.",
      },
      {
        question: 'Comment répartir entre la salle et la cuisine ?',
        answer:
          "Deux approches : un pourboire nominatif, où le client choisit son serveur, ou un pourboire d'équipe réparti selon vos règles. Le nominatif motive davantage en salle ; l'équipe évite les tensions avec la cuisine. Le choix est le vôtre.",
      },
      {
        question: 'Mes serveurs doivent-ils faire des démarches ?',
        answer:
          "Chaque bénéficiaire connecte une fois son compte bancaire via une vérification d'identité imposée par la réglementation anti-blanchiment. Comptez quelques minutes, une seule fois.",
      },
      {
        question: 'Et si un serveur quitte l\'établissement ?',
        answer:
          "Vous le désactivez depuis le tableau de bord et il n'apparaît plus dans la liste. Les pourboires déjà reçus lui restent acquis : ils ont été versés sur son compte, pas sur le vôtre.",
      },
    ],
    sources: [
      {
        label: "L'Hôtellerie Restauration — passer au pourboire dématérialisé",
        url: 'https://www.lhotellerie-restauration.fr/actualite/comment-passer-au-pourboire-dematerialise',
        verifiedOn: '2026-07-27',
      },
    ],
  },
  {
    slug: 'bar',
    trade: 'Bar',
    tradePlural: 'les bars',
    title: 'Pourboire par carte pour bar et brasserie',
    description:
      'Service au comptoir, tickets courts, rotation rapide : pourquoi le bar est le format où le pourboire dématérialisé se déclenche le plus souvent.',
    h1: 'Le pourboire par carte, pour les bars et brasseries',
    cardSummary:
      'Beaucoup de transactions, des montants faibles, un comptoir face au client : le contexte le plus favorable au tag.',
    datePublished: '2026-07-27',
    dateModified: '2026-07-27',
    related: ['restaurant', 'cafe'],
    faq: [
      {
        question: 'Le montant proposé est-il adapté à un service au comptoir ?',
        answer:
          "Les montants suggérés sont paramétrables. Sur un bar, des paliers bas déclenchent bien plus souvent qu'un pourcentage calqué sur la restauration assise.",
      },
      {
        question: 'Où poser la plaque dans un bar ?',
        answer:
          "Sur le comptoir, côté client, à hauteur de regard au moment de régler. C'est l'emplacement qui convertit le mieux : le geste se fait pendant l'attente du rendu.",
      },
      {
        question: 'Est-ce que ça ralentit le service ?',
        answer:
          "Non : le client tape son téléphone pendant que vous encaissez ou servez le suivant. L'opération se fait en parallèle, pas à la place.",
      },
    ],
    sources: [
      {
        label: "L'Hôtellerie Restauration — passer au pourboire dématérialisé",
        url: 'https://www.lhotellerie-restauration.fr/actualite/comment-passer-au-pourboire-dematerialise',
        verifiedOn: '2026-07-27',
      },
    ],
  },
  {
    slug: 'cafe',
    trade: 'Café',
    tradePlural: 'les cafés',
    title: 'Pourboire par carte pour café et salon de thé',
    description:
      'Clientèle d\'habitués, tickets faibles, forte fréquence : comment le pourboire dématérialisé fonctionne dans un café, et quand il ne vaut pas le coup.',
    h1: 'Le pourboire par carte, pour les cafés',
    cardSummary:
      "Des habitués qui reviennent chaque semaine : la fréquence compense largement la faiblesse des montants.",
    datePublished: '2026-07-27',
    dateModified: '2026-07-27',
    related: ['bar', 'restaurant'],
    faq: [
      {
        question: 'Des pourboires de 1 € valent-ils la peine ?',
        answer:
          "C'est la fréquence qui compte. Un habitué qui laisse 1 € trois fois par semaine dépasse sur l'année le client de passage qui laisse 5 € une fois.",
      },
      {
        question: 'Et en vente à emporter ?',
        answer:
          "Le pourboire fonctionne moins bien sans service à table ou au comptoir : il n'y a pas de moment d'échange. Si votre activité est majoritairement à emporter, attendez-vous à un rendement nettement plus faible.",
      },
    ],
    sources: [
      {
        label: 'France Num — mettre en place le pourboire par carte bancaire',
        url: 'https://www.francenum.gouv.fr/guides-et-conseils/developpement-commercial/solutions-de-paiement/mettre-en-place-le-pourboire-par',
        verifiedOn: '2026-07-27',
      },
    ],
  },
  {
    slug: 'coiffeur',
    trade: 'Salon de coiffure',
    tradePlural: 'les salons de coiffure',
    title: 'Pourboire par carte pour salon de coiffure',
    description:
      "Prestation longue, relation personnelle, paiement au comptoir : ce que le pourboire dématérialisé change dans un salon, et pour qui il change vraiment quelque chose.",
    h1: 'Le pourboire par carte, pour les salons de coiffure',
    cardSummary:
      "Peu de clients par jour mais une relation forte et des tickets élevés : le pourboire y est moins fréquent qu'en restauration, mais plus généreux.",
    datePublished: '2026-07-27',
    dateModified: '2026-07-27',
    related: ['restaurant', 'bar'],
    faq: [
      {
        question: 'La culture du pourboire existe-t-elle vraiment en coiffure ?',
        answer:
          "Moins qu'en restauration, mais elle existe, surtout sur les prestations longues et chez les clients fidèles. Soyez réaliste sur les volumes : un salon voit huit à douze clients par jour, pas soixante.",
      },
      {
        question: 'Comment gérer les coiffeurs en location de fauteuil ?',
        answer:
          "Un indépendant en location de fauteuil encaisse pour lui-même : il peut avoir son propre profil et son propre compte bancaire, sans que les sommes transitent par le salon.",
      },
      {
        question: 'Est-ce que ça met le client mal à l\'aise ?',
        answer:
          "La plaque est passive : elle ne demande rien et ne s'affiche pas sur un écran face au client. C'est précisément l'inverse du terminal qui propose un pourcentage sous les yeux du coiffeur.",
      },
    ],
    sources: [
      {
        label: "L'Éclaireur des Coiffeurs — pourboires défiscalisés et dématérialisés",
        url: 'https://www.leclaireur-coiffeurs.com/les-pourboires-defiscalises-et-dematerialises/',
        verifiedOn: '2026-07-27',
      },
    ],
  },
  {
    slug: 'tatoueur',
    trade: 'Tatoueur',
    tradePlural: 'les tatoueurs',
    title: 'Pourboire par carte pour tatoueur',
    description:
      "Ticket élevé, séance longue, clientèle 100 % carte : le métier où un pourboire dématérialisé rapporte le plus par client. Ce que ça change en studio.",
    h1: 'Le pourboire par carte, pour les tatoueurs',
    cardSummary:
      'Le meilleur montant par pourboire de tous les métiers : 20 à 40 € quand il tombe, sur une clientèle qui ne porte plus de liquide.',
    datePublished: '2026-07-27',
    dateModified: '2026-07-27',
    related: ['barbier', 'coiffeur'],
    faq: [
      {
        question: 'Le pourboire au tatoueur, ça se fait vraiment en France ?',
        answer:
          "Moins systématiquement qu'aux États-Unis, mais oui — surtout sur les grosses pièces et avec les clients fidèles. La culture existe, elle est simplement bridée par l'absence d'espèces.",
      },
      {
        question: 'Comment gérer un studio avec plusieurs artistes ?',
        answer:
          "Chaque artiste a son propre profil et son propre compte bancaire. Le client choisit qui il récompense, et la somme part directement chez cette personne sans transiter par le studio.",
      },
      {
        question: 'Suis-je concerné par l\'exonération jusqu\'en 2028 ?',
        answer:
          "Le dispositif vise les salariés en contact avec la clientèle sous 1,6 SMIC. La plupart des tatoueurs sont indépendants, souvent en location de poste, donc hors de ce cadre. Faites vérifier votre situation par votre comptable.",
      },
    ],
    sources: [
      {
        label: 'Analyse du marché du tatouage en France (2026)',
        url: 'https://modelesdebusinessplan.com/blogs/infos/marche-tatouage',
        verifiedOn: '2026-07-27',
      },
    ],
  },
  {
    slug: 'barbier',
    trade: 'Barbershop',
    tradePlural: 'les barbershops',
    title: 'Pourboire par carte pour barbershop',
    description:
      'La culture du pourboire la plus installée de la coiffure française, une clientèle jeune qui revient toutes les trois semaines et paie exclusivement par carte.',
    h1: 'Le pourboire par carte, pour les barbershops',
    cardSummary:
      "Culture du pourboire importée des US, clientèle fidèle qui revient toutes les 2 à 4 semaines : la répétition fait le volume.",
    datePublished: '2026-07-27',
    dateModified: '2026-07-27',
    related: ['tatoueur', 'coiffeur'],
    faq: [
      {
        question: 'En quoi un barbershop diffère-t-il d\'un salon de coiffure ?',
        answer:
          "Le rythme de retour, surtout : deux à quatre semaines contre six à huit, avec une clientèle plus jeune et une culture du pourboire nettement plus installée. Le même geste rapporte deux à trois fois plus souvent.",
      },
      {
        question: 'Et les barbiers en location de poste ?',
        answer:
          "Ils encaissent pour eux-mêmes, avec leur propre profil et leur propre compte. Le gérant n'a rien à encaisser ni à reverser, et il n'y a pas de discussion sur la répartition.",
      },
      {
        question: 'Une plaque par poste ou une seule au comptoir ?',
        answer:
          "Une par poste, avec le profil de chacun. Le client sait exactement qui il récompense, et c'est ce lien direct qui déclenche le geste — une plaque commune le dilue.",
      },
    ],
    sources: [
      {
        label: 'Le marché des barbiers en France : chiffres et statistiques',
        url: 'https://modelesdebusinessplan.com/blogs/infos/marche-barbiers-france',
        verifiedOn: '2026-07-27',
      },
    ],
  },
  {
    slug: 'guide-touristique',
    trade: 'Guide touristique',
    tradePlural: 'les guides',
    title: 'Pourboire par carte pour guide touristique',
    description:
      'Sur un free tour, le pourboire est le revenu. Vos clients sont des touristes étrangers sans euros en poche : comment récupérer ce qu\'ils voulaient déjà donner.',
    h1: 'Le pourboire par carte, pour les guides',
    cardSummary:
      "Le métier où le pourboire n'est pas un bonus mais le salaire — et où les clients n'ont par définition pas de liquide.",
    datePublished: '2026-07-27',
    dateModified: '2026-07-27',
    related: ['restaurant', 'cafe'],
    faq: [
      {
        question: 'Comment ça marche avec un groupe de trente personnes ?',
        answer:
          "La plaque se porte plutôt qu'elle ne se pose : tour de cou, porte-badge ou panneau de repérage. À la fin de la visite, les participants s'approchent successivement, chacun choisit son montant. Personne n'attend son tour à une caisse.",
      },
      {
        question: 'Un touriste étranger doit-il installer quelque chose ?',
        answer:
          "Non, et c'est décisif : personne n'installe une application française pour donner 5 € une fois dans sa vie. Le tap ouvre une page web ordinaire, le paiement se fait avec la carte déjà enregistrée dans le téléphone.",
      },
      {
        question: 'Et hors saison ?',
        answer:
          "La plaque est un achat unique sans abonnement, et la commission ne s'applique qu'aux pourboires encaissés. Les mois sans visite ne coûtent rien.",
      },
    ],
    sources: [
      {
        label: 'France Num — mettre en place le pourboire par carte bancaire',
        url: 'https://www.francenum.gouv.fr/guides-et-conseils/developpement-commercial/solutions-de-paiement/mettre-en-place-le-pourboire-par',
        verifiedOn: '2026-07-27',
      },
    ],
  },
];

export const SOLUTION_SLUGS = SOLUTIONS.map((s) => s.slug);

export function getSolution(slug: string): SolutionMeta | undefined {
  return SOLUTIONS.find((s) => s.slug === slug);
}
