// Automatic enrichment for cold-email prospects.
//
// Pipeline, all free / no API key:
//   1. recherche-entreprises.api.gouv.fr — official public API (no auth,
//      ~50 req/min) — returns site_internet and contact info when the
//      company has declared them.
//   2. If a website is found, fetch homepage + /contact + /mentions-legales
//      + /qui-sommes-nous and regex for emails. FR business sites are
//      legally required (LCEN art. 6) to publish a contact email on the
//      mentions-légales page, so the hit rate is high.
//
// The whole pipeline is best-effort: a network error / 403 / parse failure
// silently leaves the prospect unchanged, just marks enrichment_attempted_at
// so the cron / batch worker doesn't keep retrying the same prospect.

const FETCH_TIMEOUT_MS = 6000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; DigitipBot/1.0; +https://digitip.app) AppleWebKit/537.36';

// Generic catch-all addresses we KEEP (they're still useful to start a
// conversation) but de-prioritise vs nominative addresses.
const GENERIC_LOCAL_PARTS = new Set([
  'contact', 'info', 'hello', 'bonjour', 'commercial', 'commercial-fr',
  'sales', 'partenariats', 'partenariat', 'partners', 'partenaires',
]);

// Never-useful addresses we DROP outright.
const REJECTED_LOCAL_PARTS = new Set([
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon',
  'postmaster', 'webmaster', 'wordpress', 'admin', 'support@stripe',
]);

const EMAIL_RE = /\b([A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/g;
// Catches "prenom [at] domaine [dot] fr" style anti-bot obfuscation.
const OBFUSCATED_RE = /\b([A-Za-z0-9._%+-]+)\s*\[?\s*(?:at|chez|arobase)\s*\]?\s*([A-Za-z0-9-]+)\s*\[?\s*(?:dot|point|\.)\s*\]?\s*([A-Za-z]{2,})\b/gi;

const COMMON_CONTACT_PATHS = ['/contact', '/mentions-legales', '/legal', '/qui-sommes-nous', '/a-propos', '/about'];

type EnrichInput = {
  siret: string | null;
  companyName: string | null;
  city: string | null;
};

export type EnrichmentResult = {
  email: string | null;
  website: string | null;
  source: string;          // tag stored on enrichment_source
};

/**
 * Top-level enrichment. Tries every available source and returns the first
 * useful (email + website) pair. Always returns — `email` and `website` may
 * be null if nothing was found.
 */
export async function enrichProspect(p: EnrichInput): Promise<EnrichmentResult> {
  let website: string | null = null;
  let email: string | null = null;
  const sources: string[] = [];

  // Step 1: lookup the company on recherche-entreprises (free, public).
  if (p.siret) {
    const re = await searchRechercheEntreprises(p.siret);
    if (re?.website) { website = normaliseUrl(re.website); sources.push('rec-ent'); }
  }
  // Fallback: search by company name + city if no SIRET hit.
  if (!website && p.companyName) {
    const re = await searchRechercheEntreprisesByName(p.companyName, p.city);
    if (re?.website) { website = normaliseUrl(re.website); sources.push('rec-ent-name'); }
  }

  // Step 2: scrape the website if we have one.
  if (website) {
    email = await scrapeEmailFromSite(website);
    if (email) sources.push('site');
  }

  return {
    email,
    website,
    source: sources.length ? sources.join('+') : 'none',
  };
}

// ─── Recherche d'entreprises API ─────────────────────────────────────────────
// Docs: https://recherche-entreprises.api.gouv.fr/docs

type RechercheEntreprisesHit = {
  siren?: string;
  nom_complet?: string;
  siege?: { siret?: string };
  matching_etablissements?: Array<{ siret?: string }>;
  // Despite the docs claim, `site_internet` lives on the root object on most
  // hits, but on `complements.web_information` for a minority. Check both.
  site_internet?: string | null;
  complements?: { web_information?: { site_internet?: string | null } | null } | null;
  dirigeants?: Array<{ nom?: string; prenoms?: string }>;
};

async function searchRechercheEntreprises(siret: string): Promise<{ website: string | null } | null> {
  // The "by SIREN" endpoint is the strictest match.
  const siren = siret.slice(0, 9);
  try {
    const res = await fetchWithTimeout(
      `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(siren)}&page=1&per_page=1`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: RechercheEntreprisesHit[] };
    const hit = data.results?.[0];
    if (!hit) return null;
    const website = hit.site_internet ?? hit.complements?.web_information?.site_internet ?? null;
    return { website: website || null };
  } catch {
    return null;
  }
}

async function searchRechercheEntreprisesByName(
  name: string,
  city: string | null,
): Promise<{ website: string | null } | null> {
  try {
    const q = city ? `${name} ${city}` : name;
    const res = await fetchWithTimeout(
      `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&page=1&per_page=1`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: RechercheEntreprisesHit[] };
    const hit = data.results?.[0];
    if (!hit) return null;
    const website = hit.site_internet ?? hit.complements?.web_information?.site_internet ?? null;
    return { website: website || null };
  } catch {
    return null;
  }
}

// ─── Website scraping ────────────────────────────────────────────────────────

async function scrapeEmailFromSite(url: string): Promise<string | null> {
  // Try the homepage first — emails are often in the footer, header, or
  // mailto: links. Then fall back to the legally-mandated mentions légales.
  const base = url.replace(/\/+$/, '');
  const candidates = [base, ...COMMON_CONTACT_PATHS.map((p) => `${base}${p}`)];

  const seen = new Set<string>();
  const nominative: string[] = [];
  const generic: string[] = [];

  for (const candidate of candidates) {
    const html = await fetchHtml(candidate);
    if (!html) continue;
    for (const e of extractEmails(html)) {
      const norm = e.toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      const local = norm.split('@')[0];
      if (REJECTED_LOCAL_PARTS.has(local)) continue;
      if (GENERIC_LOCAL_PARTS.has(local)) generic.push(norm);
      else nominative.push(norm);
    }
    // First page that yields something nominative wins — no need to scan more.
    if (nominative.length > 0) break;
  }

  // Prefer nominative (prenom.nom@…), fall back to generic (contact@…).
  return nominative[0] ?? generic[0] ?? null;
}

function extractEmails(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(EMAIL_RE)) {
    out.push(`${m[1]}@${m[2]}`);
  }
  for (const m of html.matchAll(OBFUSCATED_RE)) {
    out.push(`${m[1]}@${m[2]}.${m[3]}`);
  }
  return out;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return null;
    const text = await res.text();
    // Cap at 1 MB — anything longer is almost certainly an embedded asset blob.
    return text.length > 1_048_576 ? text.slice(0, 1_048_576) : text;
  } catch {
    return null;
  }
}

function normaliseUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    // Drop obvious placeholder / parking-page domains.
    if (/\.parkingcrew\.|\.dan\.com$|example\.com$/i.test(u.hostname)) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
