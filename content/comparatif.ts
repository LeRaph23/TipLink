import type { FaqEntry, SourceRef } from '@/content/types';

/**
 * Data behind /fr/pourquoi-digitip and the comparison teaser on the landing.
 *
 * French comparative advertising (art. L122-1 s. code de la consommation) must
 * be objective, verifiable, limited to material and relevant features, and
 * non-disparaging. So every competitor figure here comes from the competitor's
 * own published pricing or terms, carries its source, and is rendered with the
 * date it was read. Where a competitor publishes nothing on a point, the cell
 * says so instead of guessing.
 *
 * __tests__/seo/comparatif.test.ts fails the build if a competitor cell loses
 * its source, and keeps the worked 10 € example consistent with the rates.
 *
 * When a competitor changes its pricing, update the row and VERIFIED together.
 */

export const VERIFIED = '2026-10-13';

export const SOURCES = {
  onetipPricing: {
    label: 'Onetip : page Tarifs',
    url: 'https://www.onetip-app.com/pricing',
    verifiedOn: VERIFIED,
  },
  onetipFaq: {
    label: 'Onetip : FAQ (qui paie la commission)',
    url: 'https://www.onetip-app.com/faq-app',
    verifiedOn: VERIFIED,
  },
  tipsi: {
    label: 'Tipsi : conditions générales Employé, art. 8.1',
    url: 'https://tipsi.io/terms-sales-employee',
    verifiedOn: VERIFIED,
  },
  taptiiip: {
    label: 'Tap Tiiip : pourboire digital, tarifs et exemple chiffré',
    url: 'https://www.taptiiip.com/pourboire-digital',
    verifiedOn: VERIFIED,
  },
  sunday: {
    label: 'Sunday : versement des pourboires (centre d’aide)',
    url: 'https://intercom.help/sundayapp-help/fr/articles/10963750-comment-fonctionne-le-versement-des-pourboires-chez-sunday',
    verifiedOn: VERIFIED,
  },
  stripeTpe: {
    label: 'Stripe : pourboire par carte bancaire, guide pour les professionnels (art. L3244-1 du Code du travail)',
    url: 'https://stripe.com/fr/resources/more/tips-on-bank-card-france',
    verifiedOn: VERIFIED,
  },
} satisfies Record<string, SourceRef>;

export type SourceKey = keyof typeof SOURCES;

export type Competitor = {
  key: string;
  name: string;
  /** One line on what the product is, in its own terms. */
  kind: string;
  sources: SourceKey[];
};

export const COMPETITORS: Competitor[] = [
  { key: 'onetip', name: 'Onetip', kind: 'Application de pourboire, forte en coiffure', sources: ['onetipPricing', 'onetipFaq'] },
  { key: 'tipsi', name: 'Tipsi', kind: 'Application de pourboire installée sur le TPE', sources: ['tipsi'] },
  { key: 'taptiiip', name: 'Tap Tiiip', kind: 'Pourboire par QR code', sources: ['taptiiip'] },
];

/** Cell of the big table. `tone` drives the colour, never the wording. */
export type Cell = { text: string; tone: 'good' | 'neutral' | 'bad' | 'unknown' };

export type Row = {
  criterion: string;
  /** Why the criterion matters, in one sentence. */
  why: string;
  digitip: Cell;
  /** Keyed by Competitor.key. */
  others: Record<string, Cell>;
};

const NOT_PUBLISHED: Cell = { text: 'Non indiqué sur leur site', tone: 'unknown' };

export const ROWS: Row[] = [
  {
    criterion: 'Pris sur le pourboire',
    why: 'Ce qui manque à votre équipe à l’arrivée.',
    digitip: { text: 'Rien. L’équipe reçoit 100 % du pourboire.', tone: 'good' },
    others: {
      onetip: { text: '4 % + frais bancaires (jusqu’à 5 %)', tone: 'bad' },
      tipsi: { text: '8 % TTC (taux pouvant varier selon le contrat)', tone: 'bad' },
      taptiiip: { text: '5 % + 1,5 % + 0,25 €', tone: 'bad' },
    },
  },
  {
    criterion: 'Qui paie les frais',
    why: 'Quelqu’un les paie toujours : la question est qui.',
    digitip: { text: 'Le client : 0,25 € + 5 %, affichés avant qu’il paie', tone: 'good' },
    others: {
      onetip: { text: 'Le salarié qui reçoit le pourboire', tone: 'bad' },
      tipsi: { text: 'Le salarié qui reçoit le pourboire', tone: 'bad' },
      taptiiip: { text: 'Le bénéficiaire (déduits de son pourboire)', tone: 'bad' },
    },
  },
  {
    criterion: 'Abonnement',
    why: 'Ce que vous payez même les mois creux.',
    digitip: { text: 'Aucun', tone: 'good' },
    others: {
      onetip: { text: '5 €/mois par salarié ayant reçu des pourboires', tone: 'bad' },
      tipsi: { text: '2,99 €/an par salarié', tone: 'neutral' },
      taptiiip: { text: 'Abonnement établissement séparé (montant non publié)', tone: 'bad' },
    },
  },
  {
    criterion: 'Invitation à laisser un avis Google',
    why: 'Des avis récents font remonter votre fiche dans Google Maps.',
    digitip: { text: 'Incluse, sans frais', tone: 'good' },
    others: {
      onetip: { text: 'Option à 4,50 € HT/mois', tone: 'neutral' },
      tipsi: NOT_PUBLISHED,
      taptiiip: { text: 'Oui, avec l’abonnement établissement', tone: 'neutral' },
    },
  },
  {
    criterion: 'Matériel',
    why: 'Ce qui est posé devant le client.',
    digitip: { text: 'Plaque en résine NFC + QR code, achetée une fois, garantie à vie', tone: 'good' },
    others: {
      onetip: { text: '2 tags NFC offerts ; tablette à 11 € HT/mois', tone: 'neutral' },
      tipsi: { text: 'Application installée sur votre TPE', tone: 'neutral' },
      taptiiip: { text: 'QR codes à imprimer', tone: 'neutral' },
    },
  },
  {
    criterion: 'Où arrive l’argent',
    why: 'Ce qui détermine votre travail administratif.',
    digitip: {
      text: 'Sur le compte de l’établissement (Stripe), attribué à la personne choisie, avec un relevé mensuel par salarié pour la paie',
      tone: 'neutral',
    },
    others: {
      onetip: { text: 'Sur le compte Onetip du salarié, viré chaque lundi', tone: 'good' },
      tipsi: { text: 'Sur un compte de cantonnement par salarié', tone: 'good' },
      taptiiip: { text: 'Au bénéficiaire, frais déduits', tone: 'good' },
    },
  },
];

/**
 * The worked example: one 10 € tip, what the customer pays and what reaches
 * the team. Amounts in cents. `teamMax` is set when the published rate is a
 * range (Onetip's bank fees are "up to 5 %").
 */
export type Example = {
  key: string;
  name: string;
  customerPays: number;
  team: number;
  teamMax?: number;
  /** Recurring cost on top, as published. */
  recurring: string;
  note?: string;
  source?: SourceKey;
};

export const TIP_CENTS = 1000;

export const EXAMPLE: Example[] = [
  { key: 'digitip', name: 'Digitip', customerPays: 1075, team: 1000, recurring: 'Aucun abonnement' },
  { key: 'onetip', name: 'Onetip', customerPays: 1000, team: 910, teamMax: 960, recurring: '+ 5 €/mois par salarié', source: 'onetipFaq' },
  { key: 'tipsi', name: 'Tipsi', customerPays: 1000, team: 920, recurring: '+ 2,99 €/an par salarié', source: 'tipsi' },
  { key: 'taptiiip', name: 'Tap Tiiip', customerPays: 1000, team: 910, recurring: '+ abonnement établissement', source: 'taptiiip' },
];

/** Digitip vs the terminal, the comparison most owners actually make. */
export const TPE_ROWS: { criterion: string; digitip: string; tpe: string }[] = [
  {
    criterion: 'Le moment du choix',
    digitip: 'Quand le client veut, avec son propre téléphone',
    tpe: 'Au moment de payer, terminal tendu par le serveur',
  },
  {
    criterion: 'Le client choisit à qui',
    digitip: 'Oui, il voit l’équipe et choisit une personne',
    tpe: 'Non, tout part dans un pot commun',
  },
  {
    criterion: 'Suivi par salarié',
    digitip: 'Chaque pourboire est attribué et horodaté, relevé mensuel prêt pour la paie',
    tpe: 'À reconstituer vous-même à partir des tickets',
  },
  {
    criterion: 'Frais sur le pourboire',
    digitip: 'Payés par le client, affichés avant le paiement',
    tpe: 'Commission bancaire sur le total, à votre charge',
  },
  {
    criterion: 'Avis Google',
    digitip: 'Proposé juste après le pourboire',
    tpe: 'Non',
  },
  {
    criterion: 'Paiement au comptoir ou à une caisse centrale',
    digitip: 'Fonctionne pareil : la plaque est là où vous la posez',
    tpe: 'Le pourboire est proposé par la personne en caisse, pas forcément celle qui a servi',
  },
];

export const FAQ: FaqEntry[] = [
  {
    question: 'Si le client paie les frais, ce n’est pas plus cher pour lui ?',
    answer:
      "Si, de 0,75 € sur un pourboire de 10 €, et c'est affiché avant qu'il paie. Ailleurs, des frais du même ordre existent aussi : ils sont simplement retirés du pourboire, sans que le client le voie. Nous préférons que le client sache ce qu'il paie et que votre équipe reçoive exactement ce qu'il a voulu donner.",
  },
  {
    question: 'Pourquoi l’argent arrive sur le compte de l’établissement et pas du salarié ?',
    answer:
      "Parce que c'est vous qui ouvrez le compte Stripe, une seule fois, et que vos salariés n'ont aucune démarche bancaire à faire. La contrepartie : vous reversez les pourboires avec la paie. Digitip attribue chaque pourboire à la personne choisie et vous donne un relevé mensuel par salarié, pour que ce reversement ne demande aucune ressaisie.",
  },
  {
    question: 'Ces tarifs concurrents sont-ils à jour ?',
    answer:
      "Ils ont été relevés sur les sites des éditeurs à la date indiquée sous le tableau, avec un lien vers chaque page. Les tarifs évoluent : vérifiez-les avant de décider, et écrivez-nous si l'un d'eux a changé, nous corrigerons la page.",
  },
  {
    question: 'Et Sunday ?',
    answer:
      "Sunday est d'abord une solution de paiement de l'addition à table, intégrée à la caisse, qui propose le pourboire dans ce parcours. C'est un autre produit : si vous voulez refondre tout le paiement en salle, c'est une option sérieuse. Sunday ne publie pas de grille de commission sur les pourboires, nous ne l'avons donc pas mis dans le tableau.",
  },
  {
    question: 'Peut-on garder le pourboire sur le TPE et ajouter Digitip ?',
    answer:
      "Oui, rien ne l'empêche. Évitez seulement de proposer le pourboire deux fois au même client : s'il vient de refuser sur le terminal, la plaque ne le fera pas changer d'avis.",
  },
];
