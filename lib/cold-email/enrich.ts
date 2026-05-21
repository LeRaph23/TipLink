// Automatic enrichment for cold-email prospects.
//
// Pipeline, all free / no API key:
//   1. recherche-entreprises.api.gouv.fr — official public API (no auth)
//      returns site_internet when the company has declared one.
//   2. If a website is found, fetch the homepage + a fan of common contact
//      paths and regex for emails. We also decode Cloudflare's
//      `data-cfemail` obfuscation, the most common anti-bot trick used by
//      small FR business sites.
//
// The whole pipeline is best-effort: a network error / 403 / parse failure
// silently leaves the prospect unchanged, just marks enrichment_attempted_at
// + a diagnostic in enrichment_source so the admin can see WHY enrichment
// failed (no_company / no_website / fetch_failed / no_email_in_html).

const FETCH_TIMEOUT_MS = 9000;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

// Generic catch-all addresses we KEEP (still useful to start a conversation)
// but de-prioritise vs nominative addresses.
const GENERIC_LOCAL_PARTS = new Set([
  'contact', 'info', 'hello', 'bonjour', 'commercial',
  'sales', 'partenariat', 'partenariats', 'partners', 'partenaires',
  'accueil', 'reception', 'service',
]);

// Never-useful addresses we DROP outright.
const REJECTED_LOCAL_PARTS = new Set([
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon',
  'postmaster', 'webmaster', 'wordpress', 'admin', 'root',
  'newsletter', 'notification', 'notifications', 'noresponse',
]);

// Top-level domains we drop — image hosts, asset CDNs, free wildcard hosts.
const REJECTED_DOMAINS = new Set([
  'sentry.io', 'wixstudio.io', 'wordpress.com', 'wp.com',
  'example.com', 'localhost', 'placeholder.com',
]);

const EMAIL_RE = /\b([A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/g;
// Catches "prenom [at] domaine [dot] fr" anti-bot obfuscation.
const OBFUSCATED_RE = /\b([A-Za-z0-9._%+-]+)\s*\[?\s*(?:at|chez|arobase)\s*\]?\s*([A-Za-z0-9-]+)\s*\[?\s*(?:dot|point|\.)\s*\]?\s*([A-Za-z]{2,})\b/gi;
// Cloudflare email obfuscation: <a href="/cdn-cgi/l/email-protection#abcdef…">
const CF_EMAIL_RE = /data-cfemail=["']([0-9a-fA-F]+)["']/g;

const COMMON_CONTACT_PATHS = [
  '/contact', '/contact-us', '/nous-contacter', '/coordonnees', '/coordonnées',
  '/mentions-legales', '/mentions-légales', '/legal',
  '/qui-sommes-nous', '/a-propos', '/about', '/about-us',
  '/equipe', '/notre-equipe', '/team', '/the-team',
];

type EnrichInput = {
  siret: string | null;
  companyName: string | null;
  city: string | null;
};

export type EnrichmentResult = {
  email: string | null;
  website: string | null;
  /** Diagnostic tag stored on enrichment_source — useful for the admin
   *  to know why a row stayed empty. */
  source: string;
};

/**
 * Top-level enrichment. Tries every available source and returns the first
 * useful (email + website) pair. Always returns — `email` and `website` may
 * be null if nothing was found.
 */
export async function enrichProspect(p: EnrichInput): Promise<EnrichmentResult> {
  let website: string | null = null;
  let email: string | null = null;
  const diag: string[] = [];

  // Step 1: lookup the company on recherche-entreprises (free, public).
  if (p.siret) {
    const re = await searchRechercheEntreprises(p.siret);
    if (re?.website) { website = normaliseUrl(re.website); if (website) diag.push('rec-ent'); }
  }
  // Fallback: search by company name + city if no SIRET hit.
  if (!website && p.companyName) {
    const re = await searchRechercheEntreprisesByName(p.companyName, p.city);
    if (re?.website) { website = normaliseUrl(re.website); if (website) diag.push('rec-ent-name'); }
  }
  if (!website) diag.push('no_website');

  // Step 2: scrape the website if we have one.
  if (website) {
    const scraped = await scrapeEmailFromSite(website);
    if (scraped) {
      email = scraped;
      diag.push('site_email');
    } else {
      diag.push('no_email_on_site');
    }
  }

  return {
    email,
    website,
    source: diag.join('+') || 'none',
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
      const [local, domain] = norm.split('@');
      if (!local || !domain) continue;
      if (REJECTED_LOCAL_PARTS.has(local)) continue;
      if (REJECTED_DOMAINS.has(domain)) continue;
      // Drop image-asset false positives like `logo@2x.png`.
      if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|map)$/i.test(domain)) continue;
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
  // 1) Plain emails (mailto: + text).
  for (const m of html.matchAll(EMAIL_RE)) {
    out.push(`${m[1]}@${m[2]}`);
  }
  // 2) Obfuscated "prenom [at] domaine [dot] fr".
  for (const m of html.matchAll(OBFUSCATED_RE)) {
    out.push(`${m[1]}@${m[2]}.${m[3]}`);
  }
  // 3) Cloudflare email obfuscation — data-cfemail="<hex>" where the first
  //    byte is the XOR key and the rest is the ASCII email XOR'd with it.
  for (const m of html.matchAll(CF_EMAIL_RE)) {
    const decoded = decodeCloudflareEmail(m[1]);
    if (decoded) out.push(decoded);
  }
  return out;
}

function decodeCloudflareEmail(hex: string): string | null {
  if (hex.length < 4 || hex.length % 2 !== 0) return null;
  try {
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
    const key = bytes[0];
    let out = '';
    for (let i = 1; i < bytes.length; i++) {
      out += String.fromCharCode(bytes[i] ^ key);
    }
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  // Try HTTPS first then fall back to HTTP — many tiny FR business sites
  // still don't have a TLS cert. Browsers happily downgrade for them.
  const urls = url.startsWith('http://') ? [url] : [url, url.replace(/^https:/, 'http:')];
  for (const candidate of urls) {
    try {
      const res = await fetchWithTimeout(candidate, {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
          'accept-encoding': 'gzip, deflate, br',
        },
        redirect: 'follow',
      });
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('text/html') && !ct.includes('application/xhtml')) continue;
      const text = await res.text();
      return text.length > 1_572_864 ? text.slice(0, 1_572_864) : text;
    } catch {
      // try next protocol
    }
  }
  return null;
}

function normaliseUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    // Drop obvious placeholder / parking-page / social-only "websites".
    if (/\.parkingcrew\.|\.dan\.com$|example\.com$|sedoparking\.com$/i.test(u.hostname)) return null;
    if (/^(www\.)?(facebook|instagram|linkedin|twitter|tiktok|youtube)\.com$/i.test(u.hostname)) return null;
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
