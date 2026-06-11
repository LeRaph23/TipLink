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
  categorieJuridique: string | null;
};

export type SireneSearchOptions = {
  nafCodes?: string[];             // ex: ['4791B', '7022Z']
  createdAfter?: string;           // ISO date 'YYYY-MM-DD'
  createdBefore?: string;
  postalCodePrefix?: string;       // ex: '69' for Lyon dept
  personnePhysiqueOnly?: boolean;  // default true
  /**
   * SIRENE `trancheEffectifsUniteLegale` values to OR-filter.
   *   NN = personne physique sans effectif
   *   00 = 0 salarié, 01 = 1-2, 02 = 3-5, 03 = 6-9, 11 = 10-19,
   *   12 = 20-49, 21 = 50-99, 22 = 100-199, …
   * Used to keep the commercial-pro funnel restricted to small structures
   * "à leur compte" — large groups (Gamm Vert, etc.) would otherwise leak in.
   */
  trancheEffectifs?: string[];
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
    categorieJuridiqueUniteLegale?: string | null;
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

// SIRENE stores NAF codes in dotted form (e.g. "47.91B"). Our suggested
// list uses the compact form ("4791B") for readability — normalize here.
function normalizeNaf(code: string): string {
  const c = code.replace(/\./g, '').toUpperCase();
  if (/^\d{4}[A-Z]$/.test(c)) return `${c.slice(0, 2)}.${c.slice(2)}`;
  return code;
}

// Build a query for a SINGLE NAF code. The /siret endpoint only accepts
// Etablissement-suffixed fields inside q= (UniteLegale-suffixed fields
// trigger a 400 syntax error). Verified empirically against the live
// API: see PR #7 debug endpoint results.
function buildQueryForNaf(opts: SireneSearchOptions, nafCode: string | null): string {
  const periodeInner: string[] = ['etatAdministratifEtablissement:A'];
  if (nafCode) {
    periodeInner.push(`activitePrincipaleEtablissement:${normalizeNaf(nafCode)}`);
  }

  const parts: string[] = [`periode(${periodeInner.join(' AND ')})`];

  if (opts.createdAfter || opts.createdBefore) {
    const after = opts.createdAfter ?? '*';
    const before = opts.createdBefore ?? '*';
    parts.push(`dateCreationEtablissement:[${after} TO ${before}]`);
  }

  if (opts.postalCodePrefix) {
    parts.push(`codePostalEtablissement:${opts.postalCodePrefix}*`);
  }

  if (opts.trancheEffectifs && opts.trancheEffectifs.length > 0) {
    // Quote each value — "NN" and "00" need quoting so SIRENE parses them as
    // the raw string token and not as an integer / wildcard.
    const ored = opts.trancheEffectifs.map((v) => `trancheEffectifsUniteLegale:"${v}"`).join(' OR ');
    parts.push(`(${ored})`);
  }

  return parts.join(' AND ');
}

// SIRENE returns "[ND]" (Non Disponible) for fields masked under the public
// privacy mode — typically très recent personne-physique registrations.
// Treat that placeholder + empty strings as null so downstream consumers
// don't render literal "[ND]" labels in admin tables and emails.
function cleanSireneValue(v: string | null | undefined): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  if (trimmed === '[ND]') return null;
  return trimmed;
}

function mapEtablissement(raw: RawEtablissement): SireneEtablissement | null {
  if (!raw.siret) return null;
  const ul = raw.uniteLegale ?? {};
  const adr = raw.adresseEtablissement ?? {};
  const denomination = cleanSireneValue(ul.denominationUniteLegale);
  const firstName = cleanSireneValue(ul.prenomUsuelUniteLegale);
  const lastName = cleanSireneValue(ul.nomUniteLegale);
  const personFull = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  return {
    siret: raw.siret,
    companyName: denomination ?? personFull,
    firstName,
    lastName,
    city: cleanSireneValue(adr.libelleCommuneEtablissement),
    postalCode: cleanSireneValue(adr.codePostalEtablissement),
    nafCode: cleanSireneValue(ul.activitePrincipaleUniteLegale),
    creationDate: cleanSireneValue(ul.dateCreationUniteLegale),
    categorieJuridique: cleanSireneValue(ul.categorieJuridiqueUniteLegale),
  };
}

async function fetchOnePage(
  query: string,
  pageSize: number,
  debut: number,
  apiKey: string,
): Promise<{ results: SireneEtablissement[]; total: number }> {
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
    // Without a timeout a hung INSEE connection blocks the whole recruitment
    // batch until the calling function's maxDuration fires.
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 404) return { results: [], total: 0 };
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SIRENE API ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as RawResponse;
  const total = json.header?.total ?? 0;
  const results = (json.etablissements ?? [])
    .map(mapEtablissement)
    .filter((e): e is SireneEtablissement => e !== null);
  return { results, total };
}

export async function searchSirene(opts: SireneSearchOptions): Promise<SireneSearchResult> {
  const apiKey = process.env.INSEE_API_KEY;
  if (!apiKey) {
    throw new Error('INSEE_API_KEY missing. Register a free app at portail-api.insee.fr.');
  }

  const page = opts.page ?? 0;
  const pageSize = Math.min(opts.pageSize ?? 100, 1000);
  const debut = page * pageSize;

  // One SIRENE call per NAF code: the API's query parser rejects OR clauses
  // mixing repeated field names inside periode(). Sequencing keeps the
  // syntax minimal and reliable.
  const nafCodes = opts.nafCodes && opts.nafCodes.length > 0 ? opts.nafCodes : [null];
  const seen = new Set<string>();
  const aggregated: SireneEtablissement[] = [];
  let totalAcrossNaf = 0;

  for (const naf of nafCodes) {
    const query = buildQueryForNaf(opts, naf);
    const { results, total } = await fetchOnePage(query, pageSize, debut, apiKey);
    totalAcrossNaf += total;
    for (const r of results) {
      if (seen.has(r.siret)) continue;
      // Personne physique filter: SIRENE doesn't let us filter on
      // categorieJuridiqueUniteLegale inside q= at /siret, so we do it
      // here. Code 1000 = entrepreneur individuel.
      if (opts.personnePhysiqueOnly !== false && r.categorieJuridique !== '1000') continue;
      seen.add(r.siret);
      aggregated.push(r);
    }
  }

  return {
    results: aggregated,
    total: totalAcrossNaf,
    page,
    hasMore: debut + aggregated.length < totalAcrossNaf,
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
