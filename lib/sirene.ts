// Client for the INSEE SIRENE V3.11 public API.
//
// Auth: register a free app at https://portail-api.insee.fr to obtain
// a key, set it as INSEE_API_KEY. The new V3.11 API uses a header instead
// of OAuth2 (replacing the deprecated /token flow). Free quota is generous
// (~500 req/min, no daily cap on the public dataset).
//
// We only query "personne physique" auto-entrepreneurs (categorie juridique
// 1000), filtered by NAF and creation date, to maximize the chance of
// targeting young commercial profiles compatible with the ambassador program.

const SIRENE_BASE = process.env.INSEE_SIRENE_BASE_URL ?? 'https://api.insee.fr/api-sirene/3.11';

export type SireneEtablissement = {
  siret: string;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  postalCode: string | null;
  nafCode: string | null;
  creationDate: string | null;
};

export type SireneSearchOptions = {
  nafCodes?: string[];             // ex: ['4791B', '7022Z']
  createdAfter?: string;           // ISO date 'YYYY-MM-DD'
  createdBefore?: string;
  postalCodePrefix?: string;       // ex: '69' for Lyon dept
  personnePhysiqueOnly?: boolean;  // default true
  page?: number;                   // 0-indexed
  pageSize?: number;               // default 100, max 1000
};

export type SireneSearchResult = {
  results: SireneEtablissement[];
  total: number;
  page: number;
  hasMore: boolean;
};

type RawEtablissement = {
  siret?: string;
  uniteLegale?: {
    denominationUniteLegale?: string | null;
    prenomUsuelUniteLegale?: string | null;
    nomUniteLegale?: string | null;
    dateCreationUniteLegale?: string | null;
    activitePrincipaleUniteLegale?: string | null;
  };
  adresseEtablissement?: {
    codePostalEtablissement?: string | null;
    libelleCommuneEtablissement?: string | null;
  };
};

type RawResponse = {
  header?: { total?: number; statut?: number; message?: string };
  etablissements?: RawEtablissement[];
};

function buildQuery(opts: SireneSearchOptions): string {
  const parts: string[] = ['etatAdministratifUniteLegale:A'];

  if (opts.personnePhysiqueOnly !== false) {
    parts.push('categorieJuridiqueUniteLegale:1000');
  }

  if (opts.nafCodes && opts.nafCodes.length > 0) {
    const naf = opts.nafCodes.map(c => `"${c}"`).join(' OR ');
    parts.push(`(periode(activitePrincipaleUniteLegale:${naf}))`);
  }

  if (opts.createdAfter || opts.createdBefore) {
    const after = opts.createdAfter ?? '1900-01-01';
    const before = opts.createdBefore ?? '2100-01-01';
    parts.push(`dateCreationUniteLegale:[${after} TO ${before}]`);
  }

  if (opts.postalCodePrefix) {
    parts.push(`codePostalEtablissement:${opts.postalCodePrefix}*`);
  }

  return parts.join(' AND ');
}

function mapEtablissement(raw: RawEtablissement): SireneEtablissement | null {
  if (!raw.siret) return null;
  const ul = raw.uniteLegale ?? {};
  const adr = raw.adresseEtablissement ?? {};
  return {
    siret: raw.siret,
    companyName: ul.denominationUniteLegale
      ?? ([ul.prenomUsuelUniteLegale, ul.nomUniteLegale].filter(Boolean).join(' ') || null),
    firstName: ul.prenomUsuelUniteLegale ?? null,
    lastName: ul.nomUniteLegale ?? null,
    city: adr.libelleCommuneEtablissement ?? null,
    postalCode: adr.codePostalEtablissement ?? null,
    nafCode: ul.activitePrincipaleUniteLegale ?? null,
    creationDate: ul.dateCreationUniteLegale ?? null,
  };
}

export async function searchSirene(opts: SireneSearchOptions): Promise<SireneSearchResult> {
  const apiKey = process.env.INSEE_API_KEY;
  if (!apiKey) {
    throw new Error('INSEE_API_KEY missing. Register a free app at portail-api.insee.fr.');
  }

  const page = opts.page ?? 0;
  const pageSize = Math.min(opts.pageSize ?? 100, 1000);
  const debut = page * pageSize;

  const query = buildQuery(opts);
  const url = new URL(`${SIRENE_BASE}/siret`);
  url.searchParams.set('q', query);
  url.searchParams.set('nombre', String(pageSize));
  url.searchParams.set('debut', String(debut));

  const res = await fetch(url.toString(), {
    headers: {
      'X-INSEE-Api-Key-Integration': apiKey,
      'Accept': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SIRENE API ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as RawResponse;
  const total = json.header?.total ?? 0;
  const results = (json.etablissements ?? [])
    .map(mapEtablissement)
    .filter((e): e is SireneEtablissement => e !== null);

  return {
    results,
    total,
    page,
    hasMore: debut + results.length < total,
  };
}

// Estimate birth year for personne physique entrepreneurs based on the
// official INSEE "prénoms par année de naissance" public dataset trends.
// We list common French first names that peaked between 1998-2005, which
// strongly correlates with people currently 20-27 years old.
const YOUNG_FIRST_NAMES = new Set([
  'EMMA','LEA','LOUISE','CHLOE','INES','LINA','MILA','JADE','JULIA','JULIETTE','ROSE','EVA','ELENA','ALICE','LILOU','LOLA','MIA','ZOE','SARAH','MANON','LISA','CLARA','LOLA','LENA','MAEVA','OCEANE','MARGAUX','LOUNA','MAELYS','AMBRE','ELISA','ROMANE',
  'LUCAS','GABRIEL','RAPHAEL','ADAM','ARTHUR','LOUIS','JULES','LIAM','HUGO','LEO','NOAH','TIMEO','MAEL','TOM','ETHAN','NATHAN','THEO','SACHA','AARON','ELIAS','ELIOTT','ENZO','MATHIS','MATHEO','NOLAN','EVAN','LUKA','MAXIME','BAPTISTE','AXEL','SIMON','THIBAULT','VALENTIN','QUENTIN','TITOUAN','CLEMENT','ANTOINE','PAUL','SAMUEL','GABIN',
]);

export function estimateBirthYearFromFirstName(firstName: string | null | undefined): number | null {
  if (!firstName) return null;
  const upper = firstName
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Z]/g, '');
  if (!upper) return null;
  if (YOUNG_FIRST_NAMES.has(upper)) return 2003;
  return null;
}

// Suggested NAF codes for "young commercial auto-entrepreneurs" who could
// be a good fit for the ambassador program. These are commonly chosen by
// students/recent grads launching a side activity.
export const SUGGESTED_NAF_CODES: Array<{ code: string; label: string }> = [
  { code: '4791B', label: 'Vente à distance sur catalogue spécialisé' },
  { code: '4791A', label: 'Vente à distance sur catalogue général' },
  { code: '7311Z', label: 'Activités des agences de publicité' },
  { code: '7022Z', label: 'Conseil pour les affaires et autres conseils de gestion' },
  { code: '7320Z', label: 'Études de marché et sondages' },
  { code: '4799B', label: 'Vente au détail hors magasin (porte-à-porte, MLM)' },
  { code: '7021Z', label: 'Conseil en relations publiques et communication' },
  { code: '8230Z', label: 'Organisation de salons professionnels et congrès' },
  { code: '7490B', label: 'Activités spécialisées, scientifiques et techniques diverses' },
];
