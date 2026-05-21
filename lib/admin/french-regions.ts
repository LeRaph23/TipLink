// Static catalog of the 13 metropolitan French regions and their départements.
//
// Names match what OpenStreetMap stores in tag `name` for the corresponding
// admin_level=6 boundary relation — this matters because fetchZonesForCity()
// resolves département names via an exact-equal Overpass query. The Île-de-France
// communes "Val-d'Oise" / "Côte-d'Or" use the typographic apostrophe (U+2019);
// keep them as-is or the resolution silently misses.
//
// "Paris" is treated as its own département (75) at admin_level=6, so it appears
// in the IDF list alongside the seven other dépts. fetchZonesForCity('Paris')
// will resolve as a commune (level 8) first and return its arrondissements —
// that's the behavior we want for the France-wide import too.
//
// DOM-TOM are intentionally excluded for now: BAN coverage is uneven there and
// the user picked "Métropole uniquement". To add them later, append a region
// with code 'DOM-TOM' and depts: ['Guadeloupe', 'Martinique', 'Guyane',
// 'La Réunion', 'Mayotte'].

export type FrenchRegion = {
  code: string;
  name: string;
  departments: string[];
};

export const FRENCH_REGIONS: FrenchRegion[] = [
  {
    code: 'IDF',
    name: 'Île-de-France',
    departments: [
      'Paris',
      'Seine-et-Marne',
      'Yvelines',
      'Essonne',
      'Hauts-de-Seine',
      'Seine-Saint-Denis',
      'Val-de-Marne',
      'Val-d’Oise',
    ],
  },
  {
    code: 'ARA',
    name: 'Auvergne-Rhône-Alpes',
    departments: [
      'Ain',
      'Allier',
      'Ardèche',
      'Cantal',
      'Drôme',
      'Isère',
      'Loire',
      'Haute-Loire',
      'Puy-de-Dôme',
      'Rhône',
      'Savoie',
      'Haute-Savoie',
    ],
  },
  {
    code: 'BFC',
    name: 'Bourgogne-Franche-Comté',
    departments: [
      'Côte-d’Or',
      'Doubs',
      'Jura',
      'Nièvre',
      'Haute-Saône',
      'Saône-et-Loire',
      'Yonne',
      'Territoire de Belfort',
    ],
  },
  {
    code: 'BRE',
    name: 'Bretagne',
    departments: [
      'Côtes-d’Armor',
      'Finistère',
      'Ille-et-Vilaine',
      'Morbihan',
    ],
  },
  {
    code: 'CVL',
    name: 'Centre-Val de Loire',
    departments: [
      'Cher',
      'Eure-et-Loir',
      'Indre',
      'Indre-et-Loire',
      'Loir-et-Cher',
      'Loiret',
    ],
  },
  {
    code: 'COR',
    name: 'Corse',
    departments: ['Corse-du-Sud', 'Haute-Corse'],
  },
  {
    code: 'GES',
    name: 'Grand Est',
    departments: [
      'Ardennes',
      'Aube',
      'Bas-Rhin',
      'Haut-Rhin',
      'Marne',
      'Haute-Marne',
      'Meurthe-et-Moselle',
      'Meuse',
      'Moselle',
      'Vosges',
    ],
  },
  {
    code: 'HDF',
    name: 'Hauts-de-France',
    departments: [
      'Aisne',
      'Nord',
      'Oise',
      'Pas-de-Calais',
      'Somme',
    ],
  },
  {
    code: 'NOR',
    name: 'Normandie',
    departments: [
      'Calvados',
      'Eure',
      'Manche',
      'Orne',
      'Seine-Maritime',
    ],
  },
  {
    code: 'NAQ',
    name: 'Nouvelle-Aquitaine',
    departments: [
      'Charente',
      'Charente-Maritime',
      'Corrèze',
      'Creuse',
      'Dordogne',
      'Gironde',
      'Landes',
      'Lot-et-Garonne',
      'Pyrénées-Atlantiques',
      'Deux-Sèvres',
      'Vienne',
      'Haute-Vienne',
    ],
  },
  {
    code: 'OCC',
    name: 'Occitanie',
    departments: [
      'Ariège',
      'Aude',
      'Aveyron',
      'Gard',
      'Haute-Garonne',
      'Gers',
      'Hérault',
      'Lot',
      'Lozère',
      'Hautes-Pyrénées',
      'Pyrénées-Orientales',
      'Tarn',
      'Tarn-et-Garonne',
    ],
  },
  {
    code: 'PDL',
    name: 'Pays de la Loire',
    departments: [
      'Loire-Atlantique',
      'Maine-et-Loire',
      'Mayenne',
      'Sarthe',
      'Vendée',
    ],
  },
  {
    code: 'PAC',
    name: 'Provence-Alpes-Côte d’Azur',
    departments: [
      'Alpes-de-Haute-Provence',
      'Hautes-Alpes',
      'Alpes-Maritimes',
      'Bouches-du-Rhône',
      'Var',
      'Vaucluse',
    ],
  },
];

export function getRegion(code: string): FrenchRegion | undefined {
  return FRENCH_REGIONS.find((r) => r.code === code);
}

// Flatten a list of region codes into their unique département names, preserving
// the order in which they appear in FRENCH_REGIONS so progress reads naturally.
export function departmentsForRegions(codes: string[]): string[] {
  const set = new Set(codes);
  const out: string[] = [];
  for (const r of FRENCH_REGIONS) {
    if (!set.has(r.code)) continue;
    for (const d of r.departments) out.push(d);
  }
  return out;
}
