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
 * Find a Google Place that matches the given salon (name + GPS).
 * Returns null if no plausible match (closest result > 250m away or no results).
 */
export async function findGooglePlaceForSalon(input: {
  name: string;
  lat: number;
  lon: number;
}): Promise<GooglePlaceData | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY non configurée');

  const body = {
    textQuery: input.name,
    languageCode: 'fr',
    regionCode: 'FR',
    maxResultCount: 5,
    locationBias: {
      circle: {
        center: { latitude: input.lat, longitude: input.lon },
        radius: 300, // 300m around the OSM coordinates
      },
    },
    includedType: 'hair_salon', // bias toward hair salons; beauty fits too
    strictTypeFiltering: false,
  };

  const res = await fetch(PLACES_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Places HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as SearchTextResponse;
  const places = data.places ?? [];
  if (places.length === 0) return null;

  // Pick the closest result that's within 250m of our OSM coordinates
  let bestPlace: (typeof places)[number] | null = null;
  let bestDistance = Infinity;
  for (const p of places) {
    if (!p.location) continue;
    const d = haversineMeters(
      { lat: input.lat, lon: input.lon },
      { lat: p.location.latitude, lon: p.location.longitude }
    );
    if (d < bestDistance) {
      bestDistance = d;
      bestPlace = p;
    }
  }

  if (!bestPlace || bestDistance > 250) return null;

  return {
    placeId: bestPlace.id,
    displayName: bestPlace.displayName?.text ?? null,
    formattedAddress: bestPlace.formattedAddress ?? null,
    businessStatus: bestPlace.businessStatus ?? null,
    openingHours: bestPlace.regularOpeningHours ?? null,
    rating: bestPlace.rating ?? null,
    userRatingCount: bestPlace.userRatingCount ?? null,
    phoneNumber: bestPlace.internationalPhoneNumber ?? null,
    websiteUri: bestPlace.websiteUri ?? null,
  };
}

/**
 * Best-effort enrich for a batch. Sequential to play nice with Google's
 * QPS limits — no manual throttle needed (they allow 10 QPS by default).
 */
export async function enrichSalonsViaGoogle(
  inputs: Array<{ id: string; name: string; lat: number; lon: number }>,
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, GooglePlaceData | null>> {
  const results = new Map<string, GooglePlaceData | null>();
  for (let i = 0; i < inputs.length; i++) {
    const s = inputs[i];
    try {
      const r = await findGooglePlaceForSalon({ name: s.name, lat: s.lat, lon: s.lon });
      results.set(s.id, r);
    } catch {
      // Hard error on this salon — store null so we skip the update
      results.set(s.id, null);
    }
    onProgress?.(i + 1, inputs.length);
  }
  return results;
}
