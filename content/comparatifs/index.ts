import type { ContentMeta } from '@/content/types';

/**
 * Head-to-head comparison pages.
 *
 * Highest commercial intent in the content plan — someone typing
 * "digitip vs sunday" is choosing — and the highest legal exposure. French
 * comparative advertising (art. L122-1 s. code de la consommation) must be
 * objective, verifiable, limited to material and relevant features, and
 * non-disparaging.
 *
 * That constraint is encoded in the type rather than left to good intentions:
 * every row carries a `source` URL and a `verifiedOn` date, both rendered on
 * the page, and __tests__/seo/content-registry.test.ts fails the build if one
 * is missing. Rows describe published, checkable facts about a competitor's
 * offering — never a judgement about its quality.
 *
 * Deliberately absent: Review or AggregateRating markup about competitors.
 * Self-assigned review markup is explicitly against Google's guidelines.
 */

export type ComparisonRow = {
  /** The feature being compared. */
  criterion: string;
  digitip: string;
  competitor: string;
  /** Where the competitor claim comes from. */
  source: string;
  /** ISO date the source was last checked. */
  verifiedOn: string;
};

export type ComparisonMeta = ContentMeta & {
  competitor: string;
  cardSummary: string;
  /** One honest sentence on who the competitor genuinely suits better. */
  bestFor: string;
  rows: ComparisonRow[];
};

const VERIFIED = '2026-07-27';

export const COMPARISONS: ComparisonMeta[] = [
  {
    slug: 'digitip-vs-sunday',
    competitor: 'Sunday',
    title: 'Digitip ou Sunday : lequel choisir',
    description:
      'Sunday est une solution de paiement à table qui inclut le pourboire. Digitip ne fait que le pourboire. Ce que ça change concrètement pour un restaurant.',
    h1: 'Digitip ou Sunday ?',
    cardSummary:
      'Paiement à table complet contre plaque dédiée au pourboire. Deux produits différents, pas deux versions du même.',
    bestFor:
      "Sunday si vous voulez refondre tout le parcours de paiement à table, avec l'addition et le règlement dans la même app.",
    datePublished: '2026-07-27',
    dateModified: '2026-07-27',
    related: ['digitip-vs-onetip'],
    rows: [
      {
        criterion: 'Périmètre',
        digitip: 'Le pourboire uniquement',
        competitor: "Paiement de l'addition à table, pourboire inclus dans le parcours",
        source: 'https://www.entrepreneurhero.fr/terminal-de-paiement/sunday-paiement-restaurant-avis/',
        verifiedOn: VERIFIED,
      },
      {
        criterion: 'Support',
        digitip: 'Plaque NFC + QR code, posée où vous voulez',
        competitor: 'QR code sur l’addition, intégré au parcours de paiement',
        source: 'https://www.entrepreneurhero.fr/terminal-de-paiement/sunday-paiement-restaurant-avis/',
        verifiedOn: VERIFIED,
      },
      {
        criterion: 'Intégration caisse',
        digitip: 'Aucune — fonctionne indépendamment de votre caisse',
        competitor: 'Conçu pour s’intégrer au système de caisse du restaurant',
        source: 'https://www.entrepreneurhero.fr/terminal-de-paiement/comparatif-paiement-restaurants/',
        verifiedOn: VERIFIED,
      },
      {
        criterion: 'Secteur visé',
        digitip: 'Restauration, bar, café, coiffure, beauté',
        competitor: 'Restauration',
        source: 'https://www.entrepreneurhero.fr/terminal-de-paiement/sunday-paiement-restaurant-avis/',
        verifiedOn: VERIFIED,
      },
    ],
    faq: [
      {
        question: 'Peut-on utiliser les deux ?',
        answer:
          "Rien ne s'y oppose techniquement : Digitip ne s'intègre pas à votre caisse et ne touche pas au règlement de l'addition. En pratique, proposer deux fois le pourboire dans le même parcours crée de la confusion — mieux vaut trancher.",
      },
      {
        question: 'Digitip fonctionne-t-il sans changer de caisse ?',
        answer:
          "Oui, c'est le principe : la plaque est autonome et ne communique avec aucun système existant. C'est ce qui la rend installable en deux minutes, y compris dans un établissement sans caisse moderne.",
      },
    ],
    sources: [
      {
        label: 'Sunday : avis sur cette solution de paiement en restauration',
        url: 'https://www.entrepreneurhero.fr/terminal-de-paiement/sunday-paiement-restaurant-avis/',
        verifiedOn: VERIFIED,
      },
      {
        label: 'Comparatif des solutions de paiement pour les restaurants en 2026',
        url: 'https://www.entrepreneurhero.fr/terminal-de-paiement/comparatif-paiement-restaurants/',
        verifiedOn: VERIFIED,
      },
    ],
  },
  {
    slug: 'digitip-vs-onetip',
    competitor: 'OneTip',
    title: 'Digitip ou OneTip : lequel choisir',
    description:
      'OneTip et Digitip visent le même besoin : le pourboire dématérialisé. Les différences portent sur le matériel, les secteurs visés et le modèle de prix.',
    h1: 'Digitip ou OneTip ?',
    cardSummary:
      'Le concurrent le plus proche sur le pourboire dématérialisé, avec une présence forte en coiffure.',
    bestFor:
      "OneTip si vous êtes un salon de coiffure et que la présence d'une tablette dédiée au comptoir vous convient.",
    datePublished: '2026-07-27',
    dateModified: '2026-07-27',
    related: ['digitip-vs-sunday'],
    rows: [
      {
        criterion: 'Matériel',
        digitip: 'Plaque époxy NFC + QR code',
        competitor: 'Kits incluant tablettes, autocollants NFC et QR codes personnalisés',
        source: 'https://www.taptiiip.com/blog/comparatif-solutions-pourboire-digital',
        verifiedOn: VERIFIED,
      },
      {
        criterion: 'Secteur principal',
        digitip: 'Restauration, bar, café, coiffure, beauté',
        competitor: 'Forte présence en salons de coiffure, également hôtellerie et restauration',
        source: 'https://www.taptiiip.com/blog/comparatif-solutions-pourboire-digital',
        verifiedOn: VERIFIED,
      },
      {
        criterion: 'Modèle de prix',
        digitip: 'Achat unique de la plaque, puis 5 % sur les pourboires encaissés',
        competitor: 'Consulter leur grille tarifaire — non publiée de façon stable',
        source: 'https://www.onetip-app.com/',
        verifiedOn: VERIFIED,
      },
    ],
    faq: [
      {
        question: 'Faut-il une tablette ?',
        answer:
          "Pas avec Digitip : la plaque est passive, sans électronique active ni batterie. C'est un choix de fond — une tablette au comptoir demande de l'alimentation, de la place, et se retrouve tôt ou tard éteinte ou déplacée.",
      },
      {
        question: 'Qui reçoit les pourboires ?',
        answer:
          "Avec Digitip, la somme part sur le compte bancaire du bénéficiaire choisi par le client, sans transiter par l'établissement. Vérifiez ce point chez tout concurrent : c'est ce qui détermine votre charge administrative.",
      },
    ],
    sources: [
      {
        label: 'Comparatif des solutions de pourboire digital en France (2026)',
        url: 'https://www.taptiiip.com/blog/comparatif-solutions-pourboire-digital',
        verifiedOn: VERIFIED,
      },
      {
        label: 'OneTip — site officiel',
        url: 'https://www.onetip-app.com/',
        verifiedOn: VERIFIED,
      },
    ],
  },
];

export const COMPARISON_SLUGS = COMPARISONS.map((c) => c.slug);

export function getComparison(slug: string): ComparisonMeta | undefined {
  return COMPARISONS.find((c) => c.slug === slug);
}
