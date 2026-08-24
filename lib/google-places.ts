// Google Places API (New) — text search + place details in one round-trip.
//
// We use the "Search Text" endpoint with a tight location restriction around
// the salon's known GPS position. Field masks keep the cost low (we only ask
// for what we need).
//
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search

const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

// Field mask — billing tier is determined by the most expensive field requested.
// businessStatus, regularOpeningHours, rating, userRatingCount = Place Details
// (Pro SKU). formattedAddress + displayName + id are Essentials (cheap).
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.businessStatus',
  'places.regularOpeningHours',
  'places.rating',
  'places.userRatingCount',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.location',
].join(',');

export type GooglePlaceData = {
  placeId: string;
  displayName: string | null;
  formattedAddress: string | null;
  businessStatus: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | null;
  openingHours: GoogleOpeningHours | null;
  rating: number | null;
  userRatingCount: number | null;
  phoneNumber: string | null;
  websiteUri: string | null;
};

export type GoogleOpeningHours = {
  weekdayDescriptions?: string[];
  periods?: Array<{
    open?: { day: number; hour: number; minute: number };
    close?: { day: number; hour: number; minute: number };
  }>;
  openNow?: boolean;
};

type SearchTextResponse = {
  places?: Array<{
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    businessStatus?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
    regularOpeningHours?: GoogleOpeningHours;
    rating?: number;
    userRatingCount?: number;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    location?: { latitude: number; longitude: number };
  }>;
};

/**
 * Turns a Google error body into something a human can act on.
 *
 * Google splits its 403s into two very different shapes, and telling them apart
 * is the whole diagnosis:
 *
 *  - A KEY problem carries `error.details[].reason` — API_KEY_HTTP_REFERRER_BLOCKED,
 *    API_KEY_IP_ADDRESS_BLOCKED, API_KEY_SERVICE_BLOCKED, API_KEY_INVALID,
 *    SERVICE_DISABLED. Fix it on the key or the API.
 *  - A bare `"The caller does not have permission"` with NO details is the
 *    generic consumer denial. On Maps Platform that means the project itself is
 *    not allowed to call the API — in practice: no active billing account.
 *    Editing the key cannot fix it, which is why key-level changes appear to do
 *    nothing.
 *
 * The key's last 4 characters are included so the key actually in use can be
 * compared with the one being edited in the Cloud console — two keys in the same
 * project produce identical metrics, so that is otherwise unfalsifiable. Server
 * logs only; never returned to the browser.
 */
function describeGoogleError(status: number, body: string, apiKey: string): string {
  const tail = apiKey.length >= 4 ? `…${apiKey.slice(-4)}` : '(vide)';
  let reason: string | null = null;
  let message: string | null = null;
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; details?: Array<{ reason?: string }> };
    };
    message = parsed.error?.message ?? null;
    reason = parsed.error?.details?.find((d) => d.reason)?.reason ?? null;
  } catch {
    // Not JSON — fall through with the raw body.
  }

  const hint = reason
    ? `reason=${reason}`
    : status === 403
      ? 'aucun details[].reason → refus au niveau du PROJET, pas de la clé ' +
        '(vérifier la facturation Google Cloud avant de retoucher la clé)'
      : '';

  return [
    `Google Places HTTP ${status}`,
    `key=${tail}`,
    hint,
    message ?? body.slice(0, 400),
  ]
    .filter(Boolean)
    .join(' | ');
}

function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Find a Google Place that matches the given salon (name + GPS, optionally city).
 * Strategy: 2 passes — (1) tight location bias 500m, (2) wider with city in
 * the text query as a fallback. Both passes accept results within 450m of
 * the OSM coordinates. Returns null if neither pass finds a plausible match.
 */
export async function findGooglePlaceForSalon(input: {
  name: string;
  lat: number;
  lon: number;
  city?: string | null;
}): Promise<GooglePlaceData | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY non configurée');

  async function runSearch(body: Record<string, unknown>): Promise<SearchTextResponse> {
    const res = await fetch(PLACES_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey!,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(describeGoogleError(res.status, text, apiKey!));
    }
    return (await res.json()) as SearchTextResponse;
  }

  function pickClosest(places: NonNullable<SearchTextResponse['places']>) {
    let best: (typeof places)[number] | null = null;
    let bestDist = Infinity;
    for (const p of places) {
      if (!p.location) continue;
      const d = haversineMeters(
        { lat: input.lat, lon: input.lon },
        { lat: p.location.latitude, lon: p.location.longitude }
      );
      if (d < bestDist) { bestDist = d; best = p; }
    }
    return { best, bestDist };
  }

  // Pass 1: name only, tight location bias. No includedType — Google
  // classifies many salons as beauty_salon / barber_shop / spa.
  const pass1 = await runSearch({
    textQuery: input.name,
    languageCode: 'fr',
    regionCode: 'FR',
    maxResultCount: 8,
    locationBias: {
      circle: {
        center: { latitude: input.lat, longitude: input.lon },
        radius: 500,
      },
    },
  });

  let { best, bestDist } = pickClosest(pass1.places ?? []);

  // Pass 2: wider — append the city to the query, no location bias.
  // Helps when the closest Google match is > 500m or when pass 1 misses.
  if (!best || bestDist > 450) {
    if (input.city) {
      const pass2 = await runSearch({
        textQuery: `${input.name} ${input.city}`,
        languageCode: 'fr',
        regionCode: 'FR',
        maxResultCount: 8,
      });
      const r2 = pickClosest(pass2.places ?? []);
      // Take pass 2 only if it's closer
      if (r2.best && r2.bestDist < bestDist) {
        best = r2.best;
        bestDist = r2.bestDist;
      }
    }
  }

  if (!best || bestDist > 450) return null;

  return {
    placeId: best.id,
    displayName: best.displayName?.text ?? null,
    formattedAddress: best.formattedAddress ?? null,
    businessStatus: best.businessStatus ?? null,
    openingHours: best.regularOpeningHours ?? null,
    rating: best.rating ?? null,
    userRatingCount: best.userRatingCount ?? null,
    phoneNumber: best.internationalPhoneNumber ?? null,
    websiteUri: best.websiteUri ?? null,
  };
}

// ─── Onboarding: pick an establishment to attach a Google review link ─────────

export type GooglePlaceCandidate = {
  placeId: string;
  displayName: string | null;
  formattedAddress: string | null;
  rating: number | null;
  userRatingCount: number | null;
  reviewUrl: string;
};

/**
 * Canonical "write a review" deep link. Opening this drops the customer
 * straight on the 5-star review form for the place — no search, no app.
 */
export function buildGoogleReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

/**
 * Best-effort normalisation of whatever a manager pastes into the manual review
 * field. Accepts a bare place_id, a writereview link, a maps URL carrying a
 * place_id, or a g.page short link. Returns a clean review URL, or null when the
 * input doesn't look like anything Google-related (so callers can reject it).
 */
export function normalizeGoogleReviewUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  // Bare place_id (Google IDs start with ChIJ / GhIJ and are alphanum-ish).
  if (/^[A-Za-z0-9_-]{15,}$/.test(v) && !v.includes('/') && !v.includes('.')) {
    return buildGoogleReviewUrl(v);
  }

  // Anything with a placeid / place_id query param → rebuild canonical link.
  const idMatch = v.match(/place[_]?id=([A-Za-z0-9_-]+)/i);
  if (idMatch) return buildGoogleReviewUrl(idMatch[1]);

  // g.page short links already deep-link to the business; append /review when
  // it isn't there so the form opens directly.
  if (/^https?:\/\/(www\.)?g\.page\//i.test(v)) {
    return v.replace(/\/+$/, '').endsWith('/review') ? v : `${v.replace(/\/+$/, '')}/review`;
  }

  // Any other Google/Maps URL: keep it as-is (still better than nothing).
  if (/^https?:\/\/([a-z0-9-]+\.)*google\.[a-z.]+\//i.test(v) ||
      /^https?:\/\/maps\.app\.goo\.gl\//i.test(v)) {
    return v;
  }

  return null;
}

/**
 * Free-text search for an establishment by name (+ optional address), used when
 * a manager sets up their Google review link. Unlike findGooglePlaceForSalon
 * this has no GPS to bias against, so we return the top matches and let the
 * human confirm which one is theirs. Each candidate carries a ready-to-use
 * review URL.
 */
export async function searchEstablishmentCandidates(input: {
  name: string;
  address?: string | null;
}): Promise<GooglePlaceCandidate[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY non configurée');

  const textQuery = [input.name, input.address].filter(Boolean).join(' ').trim();
  if (textQuery.length < 2) return [];

  const res = await fetch(PLACES_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.rating',
        'places.userRatingCount',
      ].join(','),
    },
    body: JSON.stringify({
      textQuery,
      languageCode: 'fr',
      regionCode: 'FR',
      maxResultCount: 5,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(describeGoogleError(res.status, text, apiKey));
  }

  const data = (await res.json()) as SearchTextResponse;
  return (data.places ?? []).map((p) => ({
    placeId: p.id,
    displayName: p.displayName?.text ?? null,
    formattedAddress: p.formattedAddress ?? null,
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? null,
    reviewUrl: buildGoogleReviewUrl(p.id),
  }));
}

/**
 * Best-effort enrich for a batch. Sequential to play nice with Google's
 * QPS limits — no manual throttle needed (they allow 10 QPS by default).
 *
 * Errors from Google are surfaced via the second tuple element so callers
 * can show 'API mal configurée' instead of a silent 'introuvable'.
 */
export async function enrichSalonsViaGoogle(
  inputs: Array<{ id: string; name: string; lat: number; lon: number; city?: string | null }>,
  onProgress?: (done: number, total: number) => void
): Promise<{ results: Map<string, GooglePlaceData | null>; firstError: string | null }> {
  const results = new Map<string, GooglePlaceData | null>();
  let firstError: string | null = null;
  for (let i = 0; i < inputs.length; i++) {
    const s = inputs[i];
    try {
      const r = await findGooglePlaceForSalon({ name: s.name, lat: s.lat, lon: s.lon, city: s.city });
      results.set(s.id, r);
    } catch (e) {
      results.set(s.id, null);
      if (!firstError) firstError = e instanceof Error ? e.message : String(e);
    }
    onProgress?.(i + 1, inputs.length);
  }
  return { results, firstError };
}
