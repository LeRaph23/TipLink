// Ad attribution: which campaign brought the visitor who paid.
//
// Without this, a paid test can only be judged on what Meta reports (clicks,
// cost per click) and on "did sales go up this week", which cannot tell a sale
// the ad made from one it would have got anyway. The campaign parameters of
// the last tagged visit are kept in a first-party cookie, copied onto the
// PaymentIntent at checkout, and land on the order the webhook writes.
//
// Only campaign parameters are stored: no click id, no identifier, nothing
// that follows a person. That is what lets this run whatever the visitor
// answered on the consent banner, which would otherwise skew the count
// towards the visitors who accepted. The Meta click id (fbclid) belongs to the
// pixel and is only ever read once consent is given (see lib/meta).

export const ATTRIBUTION_COOKIE = 'dt_attr';
// Last touch within 30 days, the window an ad click is usually credited over.
export const ATTRIBUTION_MAX_AGE_S = 30 * 24 * 60 * 60;

export type Attribution = {
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  /** Locale-less path of the page the visitor landed on, e.g. /solutions/tatoueur. */
  landing: string | null;
  /** When the tagged visit happened, ISO 8601. */
  at: string;
};

type Field = 'medium' | 'campaign' | 'content' | 'term';

const MAX_VALUE = 100;

/**
 * Campaign values come straight from a URL anyone can type, then travel into
 * Stripe metadata and the admin dashboard. Keep them short and printable, and
 * treat anything that reduces to nothing as absent.
 */
export function cleanValue(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f<>"'`\\]/g, '')
    .trim()
    .slice(0, MAX_VALUE);
  return cleaned.length > 0 ? cleaned : null;
}

function cleanPath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null;
  const path = raw.replace(/^\/(fr|en)(?=\/|$)/, '') || '/';
  return cleanValue(path);
}

/**
 * The attribution a landing URL carries, or null when it carries none.
 * `utm_source` is the one required field: a visit tagged only with a campaign
 * name cannot be credited to a channel, so it is not a touch.
 */
export function attributionFromUrl(
  params: URLSearchParams,
  pathname: string,
  now: Date = new Date(),
): Attribution | null {
  const source = cleanValue(params.get('utm_source'));
  if (!source) return null;
  const pick = (f: Field) => cleanValue(params.get(`utm_${f}`));
  return {
    source: source.toLowerCase(),
    medium: pick('medium')?.toLowerCase() ?? null,
    campaign: pick('campaign'),
    content: pick('content'),
    term: pick('term'),
    landing: cleanPath(pathname),
    at: now.toISOString(),
  };
}

// Plain JSON: Next's cookie API percent-encodes on write and decodes on read.
export function serializeAttribution(a: Attribution): string {
  return JSON.stringify(a);
}

/** Parses the cookie value; anything malformed or tampered reads as absent. */
export function parseAttributionCookie(raw: string | null | undefined): Attribution | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    try {
      // Still encoded, when read from a raw Cookie header.
      data = JSON.parse(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const source = cleanValue(o.source as string);
  const at = typeof o.at === 'string' && !Number.isNaN(Date.parse(o.at)) ? o.at : null;
  if (!source || !at) return null;
  return {
    source,
    medium: cleanValue(o.medium as string),
    campaign: cleanValue(o.campaign as string),
    content: cleanValue(o.content as string),
    term: cleanValue(o.term as string),
    landing: cleanPath(o.landing as string),
    at,
  };
}

// Stripe metadata is a flat string map, so the attribution travels as
// prefixed keys and is rebuilt on the webhook side.
const META_PREFIX = 'attr_';

export function attributionToMetadata(a: Attribution | null): Record<string, string> {
  if (!a) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(a)) {
    if (value) out[`${META_PREFIX}${key}`] = value;
  }
  return out;
}

export function attributionFromMetadata(
  metadata: Record<string, string> | null | undefined,
): Attribution | null {
  if (!metadata) return null;
  const source = cleanValue(metadata[`${META_PREFIX}source`]);
  if (!source) return null;
  const get = (k: keyof Attribution) => cleanValue(metadata[`${META_PREFIX}${k}`]);
  return {
    source,
    medium: get('medium'),
    campaign: get('campaign'),
    content: get('content'),
    term: get('term'),
    landing: cleanPath(metadata[`${META_PREFIX}landing`]),
    at: get('at') ?? new Date().toISOString(),
  };
}

export type AttributionSummaryRow = {
  /** null for orders with no tagged visit: direct, search, word of mouth. */
  source: string | null;
  campaign: string | null;
  orders: number;
};

/** Orders per source and campaign, busiest first, untagged orders last. */
export function summarizeAttribution(
  orders: ReadonlyArray<{ attribution: unknown }>,
): AttributionSummaryRow[] {
  const rows = new Map<string, AttributionSummaryRow>();
  for (const order of orders) {
    const a = order.attribution as Partial<Attribution> | null;
    const source = typeof a?.source === 'string' ? a.source : null;
    const campaign = source && typeof a?.campaign === 'string' ? a.campaign : null;
    const key = `${source ?? ''}\u0000${campaign ?? ''}`;
    const row = rows.get(key) ?? { source, campaign, orders: 0 };
    row.orders += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((x, y) => {
    if ((x.source === null) !== (y.source === null)) return x.source === null ? 1 : -1;
    return y.orders - x.orders;
  });
}
