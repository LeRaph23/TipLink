// Cold-email target programmes — shared constants used by both the server
// actions (actions/admin/cold-email.ts) and the client UI (SireneScraperForm).
//
// Lives outside `actions/` on purpose: a file marked `'use server'` can only
// export async functions, never plain objects or constants. NAF_PRESETS is a
// data table, so it has to sit in a neutral module.

export type ColdTargetProgram = 'ambassador' | 'commercial';

/** NAF/APE codes pre-selected per programme in the SIRENE scraper UI. */
export const NAF_PRESETS: Record<ColdTargetProgram, { code: string; label: string }[]> = {
  ambassador: [
    { code: '4791B', label: 'Vente à distance catalogue spécialisé' },
    { code: '4791A', label: 'Vente à distance catalogue général' },
    { code: '7311Z', label: 'Agences de publicité' },
    { code: '7022Z', label: 'Conseil pour les affaires' },
    { code: '7320Z', label: 'Études de marché et sondages' },
    { code: '4799B', label: 'Vente hors magasin (porte-à-porte, MLM)' },
    { code: '7021Z', label: 'Relations publiques et communication' },
    { code: '8230Z', label: 'Salons professionnels et congrès' },
    { code: '7490B', label: 'Activités spécialisées diverses' },
  ],
  // Apporteurs d'affaires B2B / agents commerciaux structurés.
  commercial: [
    { code: '4619A', label: 'Intermédiaires non spécialisés (apporteurs d\'affaires)' },
    { code: '4619B', label: 'Autres intermédiaires du commerce non spécialisés' },
    { code: '7022Z', label: 'Conseil pour les affaires et autre conseil de gestion' },
    { code: '7311Z', label: 'Agences de publicité' },
    { code: '4690Z', label: 'Commerce de gros non spécialisé' },
    { code: '4611A', label: 'Centrales d\'achat alimentaires' },
    { code: '7820Z', label: 'Activités des agences de travail temporaire' },
    { code: '7490B', label: 'Activités spécialisées diverses' },
  ],
};
