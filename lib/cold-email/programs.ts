// Cold-email target programmes — shared constants used by both the server
// actions (actions/admin/cold-email.ts) and the client UI (SireneScraperForm).
//
// Lives outside `actions/` on purpose: a file marked `'use server'` can only
// export async functions, never plain objects or constants. NAF_PRESETS is a
// data table, so it has to sit in a neutral module.

export type ColdTargetProgram = 'ambassador' | 'commercial';

/**
 * Sub-vertical inside the "commercial pros" programme. Used purely for the
 * SIRENE scraper UI to pre-select the right APE/NAF codes. The vertical
 * itself isn't persisted on the prospect — `naf_code` is the source of truth.
 */
export type CommercialVertical = 'restauration' | 'beaute' | 'general';

/**
 * Size bucket for the SIRENE `trancheEffectifs*` filter. Mirrors the INSEE
 * code list (see https://www.insee.fr/fr/information/2028147) but grouped
 * into 3 admin-friendly ranges. Commercial pros default to "indé" so we
 * never land on chains / franchises / large groups (e.g. Gamm Vert).
 */
export type SizeBucket = 'indé' | 'tpe' | 'all';

/**
 * SIRENE `trancheEffectifsUniteLegale` values to OR together for each bucket.
 *   NN = personne physique sans effectif déclaré
 *   00 = 0 salarié
 *   01 = 1-2 salariés
 *   02 = 3-5 salariés
 *   03 = 6-9 salariés
 *   11 = 10-19 salariés
 */
export const SIZE_BUCKET_VALUES: Record<Exclude<SizeBucket, 'all'>, string[]> = {
  indé: ['NN', '00', '01', '02'],
  tpe:  ['NN', '00', '01', '02', '03', '11'],
};

/**
 * Ambassador presets — students / jeunes diplômés / reconversion looking
 * for a déclaré side activity. Unchanged from the original list.
 */
const AMBASSADOR_NAF: { code: string; label: string }[] = [
  { code: '4791B', label: 'Vente à distance catalogue spécialisé' },
  { code: '4791A', label: 'Vente à distance catalogue général' },
  { code: '7311Z', label: 'Agences de publicité' },
  { code: '7022Z', label: 'Conseil pour les affaires' },
  { code: '7320Z', label: 'Études de marché et sondages' },
  { code: '4799B', label: 'Vente hors magasin (porte-à-porte, MLM)' },
  { code: '7021Z', label: 'Relations publiques et communication' },
  { code: '8230Z', label: 'Salons professionnels et congrès' },
  { code: '7490B', label: 'Activités spécialisées diverses' },
];

/**
 * Commercial-pro APE codes, grouped by vertical the user actually wants to
 * recruit into. Picked for "the person calling on those clients ALREADY":
 *   - Restauration / CHR : food & beverage wholesalers TPE — they walk into
 *     restaurants & bars every week.
 *   - Beauté / Coiffure  : cosmetics & coiffure-supply wholesalers — they
 *     walk into salons & instituts every week.
 *   - Généraliste        : apporteurs d'affaires not tied to a vertical.
 *
 * "Conseil pour les affaires" (7022Z) is INTENTIONALLY excluded from every
 * commercial preset — far too generic, brought back Gamm Vert holdings and
 * a long tail of irrelevant SARL conseil.
 */
export const COMMERCIAL_NAF_BY_VERTICAL: Record<CommercialVertical, { code: string; label: string }[]> = {
  restauration: [
    { code: '4634Z', label: 'Commerce de gros de boissons (CHR)' },
    { code: '4639A', label: 'Gros alimentaire non spé. conditionné' },
    { code: '4639B', label: 'Gros alimentaire non spé. non conditionné' },
    { code: '4631Z', label: 'Gros de fruits et légumes' },
    { code: '4632A', label: 'Gros de viandes de boucherie' },
    { code: '4632B', label: 'Gros de produits surgelés' },
    { code: '4636Z', label: 'Gros de sucre, chocolat, confiserie' },
    { code: '4637Z', label: 'Gros de café, thé, cacao' },
    { code: '4638A', label: 'Gros de poissons & crustacés' },
  ],
  beaute: [
    { code: '4645Z', label: 'Gros de parfumerie & produits de beauté' },
    { code: '4647Z', label: 'Gros de meubles, tapis, éclairage' },
    { code: '4642Z', label: 'Gros d\'habillement et chaussures' },
    { code: '4674A', label: 'Gros de quincaillerie' },
  ],
  general: [
    { code: '4619A', label: 'Intermédiaires non spécialisés' },
    { code: '4619B', label: 'Autres intermédiaires du commerce' },
    { code: '7820Z', label: 'Agences de travail temporaire' },
    { code: '7022Z', label: 'Conseil pour les affaires (très large)' },
  ],
};

export const COMMERCIAL_VERTICAL_LABEL: Record<CommercialVertical, string> = {
  restauration: 'Restauration & CHR',
  beaute: 'Beauté & Coiffure',
  general: 'Généraliste',
};

/** Default APE selection per programme + vertical when the UI opens. */
export const DEFAULT_NAF_SELECTION = {
  ambassador: new Set(['4791B', '4791A']),
  commercial: {
    restauration: new Set(['4634Z', '4639A', '4639B']),
    beaute: new Set(['4645Z']),
    general: new Set(['4619A', '4619B']),
  },
} as const;

/**
 * Legacy export for backward compatibility — flat presets used by the older
 * scraper UI. Kept until every caller is migrated to the vertical-aware API.
 */
export const NAF_PRESETS: Record<ColdTargetProgram, { code: string; label: string }[]> = {
  ambassador: AMBASSADOR_NAF,
  // Default to restauration when the caller didn't pick a vertical — that's
  // the user's primary demand (cf. design notes).
  commercial: COMMERCIAL_NAF_BY_VERTICAL.restauration,
};

export { AMBASSADOR_NAF };
