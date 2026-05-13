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
      throw new Error(`Google Places HTTP ${res.status}: ${text.slice(0, 300)}`);
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
