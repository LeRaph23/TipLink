// Import salons + zones from OpenStreetMap via the Overpass API.
//
// Two endpoints are exposed:
//   - fetchZonesForCity(city)  → returns admin boundaries within the city
//     (arrondissements / quartiers / communes) usable as work zones.
//   - fetchSalonsInBbox(bbox)  → returns hair/beauty salons inside a bbox.
//
// Both run server-side only. Overpass is a public free API; we keep timeouts
// short and limit query size to avoid abuse.

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

const OVERPASS_TIMEOUT_S = 25;
const USER_AGENT = 'DigiTip-SalonImport/1.0 (+https://digitip.app; admin)';
const MAX_RETRIES_PER_ENDPOINT = 2;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type OsmZone = {
  osm_relation_id: number;
  name: string;
  city: string;   // commune in which this zone lives (= name for a whole commune)
  admin_level: number;
  bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number };
};

export type OsmSalon = {
  osm_id: number;
  osm_type: 'node' | 'way' | 'relation';
  name: string;
  lat: number;
  lon: number;
  address: string | null;
  postal_code: string | null;
  phone: string | null;
  website: string | null;
};

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = { elements?: OverpassElement[] };

async function callOverpass(query: string): Promise<OverpassResponse> {
  let lastError: Error | null = null;
  const body = `data=${encodeURIComponent(query)}`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt <= MAX_RETRIES_PER_ENDPOINT; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
          },
          body,
          signal: AbortSignal.timeout((OVERPASS_TIMEOUT_S + 5) * 1000),
        });

        if (res.status === 429 || res.status === 503) {
          // Server tells us to back off
          const retryAfter = parseInt(res.headers.get('Retry-After') ?? '', 10);
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 8000)
            : 1500 * Math.pow(2, attempt); // 1.5s, 3s, 6s
          lastError = new Error(`Overpass HTTP ${res.status} (retry-after ${Math.round(waitMs / 1000)}s)`);
          if (attempt < MAX_RETRIES_PER_ENDPOINT) {
            await sleep(waitMs);
            continue;
          }
          break; // try next endpoint
        }

        if (!res.ok) {
          lastError = new Error(`Overpass HTTP ${res.status}`);
          break; // try next endpoint
        }
        return (await res.json()) as OverpassResponse;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        break; // network error → try next endpoint
      }
    }
  }
  throw lastError ?? new Error('Overpass unreachable');
}

function buildAddress(t: Record<string, string>): string | null {
  const housenumber = t['addr:housenumber'];
  const street = t['addr:street'];
  const city = t['addr:city'];
  const parts: string[] = [];
  if (housenumber || street) {
    parts.push([housenumber, street].filter(Boolean).join(' '));
  }
  if (city) parts.push(city);
  return parts.length ? parts.join(', ') : null;
}

/**
 * Fetch admin boundaries to use as work zones for a given location name.
 *
 * The name can be either:
 *  - A commune (e.g. "Paris", "Mulhouse") — returns its arrondissements /
 *    quartiers (admin_level 9/10) when they exist, otherwise the commune
 *    itself as a single zone.
 *  - A département (e.g. "Bas-Rhin", "Haut-Rhin", "Yvelines") — returns
 *    every commune (admin_level 8) inside as a separate zone.
 *
 * Resolution order:
 *  1. Try as commune (admin_level=8).
 *  2. If no match, try as département (admin_level=6) and list its communes.
 *
 * Defensive: drop any sub-zone whose bbox centroid is more than ~50 km from
 * the parent centroid (guard against ambiguous OSM names).
 */
export async function fetchZonesForCity(city: string): Promise<OsmZone[]> {
  const safeCity = city.replace(/["\\]/g, ' ').trim();
  if (!safeCity) return [];

  function bboxCentre(b: { minlat: number; minlon: number; maxlat: number; maxlon: number }) {
    return { lat: (b.minlat + b.maxlat) / 2, lon: (b.minlon + b.maxlon) / 2 };
  }
  function approxKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
    const dLat = (a.lat - b.lat) * 111;
    const dLon = (a.lon - b.lon) * 111 * Math.cos((a.lat * Math.PI) / 180);
    return Math.sqrt(dLat * dLat + dLon * dLon);
  }

  // ── 1) Try as a commune ──────────────────────────────────────────────────
  const communeQuery = `
    [out:json][timeout:${OVERPASS_TIMEOUT_S}];
    relation["boundary"="administrative"]["admin_level"="8"]["name"="${safeCity}"]->.commune;
    .commune map_to_area->.searchArea;
    .commune out tags bb;
    (
      relation["boundary"="administrative"]["admin_level"="10"](area.searchArea);
      relation["boundary"="administrative"]["admin_level"="9"](area.searchArea);
    );
    out tags bb;
  `;

  const communeData = await callOverpass(communeQuery);

  const communeEl = (communeData.elements ?? []).find(
    (e) => e.type === 'relation' && e.tags?.admin_level === '8' && e.tags?.name === safeCity && e.bounds
  );

  if (communeEl) {
    const communeCentre = bboxCentre(communeEl.bounds!);
    let zones: OsmZone[] = (communeData.elements ?? [])
      .filter((e) =>
        e.type === 'relation' &&
        e.tags?.name &&
        e.bounds &&
        (e.tags?.admin_level === '9' || e.tags?.admin_level === '10') &&
        approxKm(bboxCentre(e.bounds), communeCentre) < 50
      )
      .map((e) => ({
        osm_relation_id: e.id,
        name: e.tags!.name,
        city: communeEl.tags?.name ?? safeCity,
        admin_level: parseInt(e.tags!.admin_level ?? '10', 10),
        bbox: {
          minLat: e.bounds!.minlat,
          minLon: e.bounds!.minlon,
          maxLat: e.bounds!.maxlat,
          maxLon: e.bounds!.maxlon,
        },
      }));

    // Prefer level 10 (smaller) when both levels coexist.
    if (zones.some((z) => z.admin_level === 10)) {
      zones = zones.filter((z) => z.admin_level === 10);
    }

    // No sub-zones → use the commune itself as a single zone.
    if (zones.length === 0) {
      zones = [{
        osm_relation_id: communeEl.id,
        name: communeEl.tags?.name ?? safeCity,
        city: communeEl.tags?.name ?? safeCity,
        admin_level: 8,
        bbox: {
          minLat: communeEl.bounds!.minlat,
          minLon: communeEl.bounds!.minlon,
          maxLat: communeEl.bounds!.maxlat,
          maxLon: communeEl.bounds!.maxlon,
        },
      }];
    }

    zones.sort((a, b) =>
      a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' })
    );
    return zones;
  }

  // ── 2) Try as a département (admin_level=6) ──────────────────────────────
  // Every commune (admin_level=8) inside the département becomes a zone.
  const deptQuery = `
    [out:json][timeout:${OVERPASS_TIMEOUT_S}];
    relation["boundary"="administrative"]["admin_level"="6"]["name"="${safeCity}"]->.dept;
    .dept map_to_area->.searchArea;
    .dept out tags bb;
    relation["boundary"="administrative"]["admin_level"="8"](area.searchArea);
    out tags bb;
  `;

  const deptData = await callOverpass(deptQuery);

  const deptEl = (deptData.elements ?? []).find(
    (e) => e.type === 'relation' && e.tags?.admin_level === '6' && e.tags?.name === safeCity && e.bounds
  );

  if (deptEl) {
    const deptCentre = bboxCentre(deptEl.bounds!);
    const communes: OsmZone[] = (deptData.elements ?? [])
      .filter((e) =>
        e.type === 'relation' &&
        e.tags?.name &&
        e.bounds &&
        e.tags?.admin_level === '8' &&
        // Defensive — département is typically < 100 km wide.
        approxKm(bboxCentre(e.bounds), deptCentre) < 120
      )
      .map((e) => ({
        osm_relation_id: e.id,
        name: e.tags!.name,
        // For a département import, each commune is its own city.
        city: e.tags!.name,
        admin_level: 8,
        bbox: {
          minLat: e.bounds!.minlat,
          minLon: e.bounds!.minlon,
          maxLat: e.bounds!.maxlat,
          maxLon: e.bounds!.maxlon,
        },
      }));

    communes.sort((a, b) =>
      a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' })
    );
    return communes;
  }

  // ── 3) Last-resort fallback (level 7/8 by name) ──────────────────────────
  const fallback = `
    [out:json][timeout:${OVERPASS_TIMEOUT_S}];
    relation["boundary"="administrative"]["name"="${safeCity}"]["admin_level"~"^(7|8)$"];
    out tags bb;
  `;
  const fb = await callOverpass(fallback);
  return (fb.elements ?? [])
    .filter((e) => e.type === 'relation' && e.bounds)
    .map((e) => ({
      osm_relation_id: e.id,
      name: e.tags?.name ?? safeCity,
      city: e.tags?.name ?? safeCity,
      admin_level: parseInt(e.tags?.admin_level ?? '8', 10),
      bbox: {
        minLat: e.bounds!.minlat,
        minLon: e.bounds!.minlon,
        maxLat: e.bounds!.maxlat,
        maxLon: e.bounds!.maxlon,
      },
    }));
}

/**
 * Fetch hair salons / beauty salons in the given bounding box.
 * Returns nodes + way centers; deduplicated by osm_type+osm_id.
 */
export async function fetchSalonsInBbox(bbox: {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}): Promise<OsmSalon[]> {
  const { minLat, minLon, maxLat, maxLon } = bbox;
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;

  const query = `
    [out:json][timeout:${OVERPASS_TIMEOUT_S}];
    (
      node["shop"~"^(hairdresser|beauty)$"](${bboxStr});
      way["shop"~"^(hairdresser|beauty)$"](${bboxStr});
    );
    out center tags;
  `;

  const data = await callOverpass(query);
  const out: OsmSalon[] = [];

  for (const e of data.elements ?? []) {
    if (e.type !== 'node' && e.type !== 'way') continue;
    const t = e.tags ?? {};
    const name = t.name;
    if (!name) continue;

    const lat = e.type === 'node' ? e.lat : e.center?.lat;
    const lon = e.type === 'node' ? e.lon : e.center?.lon;
    if (lat == null || lon == null) continue;

    out.push({
      osm_id: e.id,
      osm_type: e.type,
      name,
      lat,
      lon,
      address: buildAddress(t),
      postal_code: t['addr:postcode'] ?? null,
      phone: t['phone'] ?? t['contact:phone'] ?? null,
      website: t['website'] ?? t['contact:website'] ?? null,
    });
  }

  return out;
}

// ─── Reverse geocoding via Nominatim ─────────────────────────────────────
// Free OSM service. Strict 1 req/s rate limit per their usage policy.
// We use it as a fallback when a salon has no addr:* tags in OSM.

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_DELAY_MS = 1100; // be polite, stay under 1 req/s

export type ReverseGeocodeResult = {
  address: string | null;
  postal_code: string | null;
};

type NominatimResponse = {
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    suburb?: string;
    neighbourhood?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
  };
  display_name?: string;
};

async function callNominatim(lat: number, lon: number): Promise<NominatimResponse | null> {
  try {
    const url = `${NOMINATIM_ENDPOINT}?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1&accept-language=fr`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as NominatimResponse;
  } catch {
    return null;
  }
}

export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  const data = await callNominatim(lat, lon);
  if (!data?.address) return { address: null, postal_code: null };
  const a = data.address;
  const street = a.road ?? a.pedestrian ?? a.suburb ?? a.neighbourhood;
  const city = a.city ?? a.town ?? a.village;
  const parts: string[] = [];
  if (a.house_number || street) {
    parts.push([a.house_number, street].filter(Boolean).join(' '));
  }
  if (city) parts.push(city);
  return {
    address: parts.length ? parts.join(', ') : null,
    postal_code: a.postcode ?? null,
  };
}

/**
 * Throttled batch reverse-geocoding (1 req/sec per Nominatim policy).
 * `onProgress` callback receives (index, total) so callers can show progress.
 */
export async function reverseGeocodeBatch(
  coords: Array<{ id: string; lat: number; lon: number }>,
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, ReverseGeocodeResult>> {
  const results = new Map<string, ReverseGeocodeResult>();
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    const r = await reverseGeocode(c.lat, c.lon);
    results.set(c.id, r);
    onProgress?.(i + 1, coords.length);
    if (i < coords.length - 1) await sleep(NOMINATIM_DELAY_MS);
  }
  return results;
}
