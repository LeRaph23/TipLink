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
 * Fetch admin boundaries (arrondissements/communes) inside the given city.
 * Strategy:
 *  1. Find the city relation by name.
 *  2. List its admin sub-areas at admin_level 9 (quartier) or 10 (arrond.).
 *     For Paris/Lyon/Marseille this returns arrondissements; for smaller
 *     towns we fall back to the city itself as a single zone.
 */
export async function fetchZonesForCity(city: string): Promise<OsmZone[]> {
  const safeCity = city.replace(/["\\]/g, ' ').trim();
  if (!safeCity) return [];

  // Look for admin_level=9 or 10 boundaries inside the named city.
  // The "area" trick: find the city as an area, then sub-relations.
  const query = `
    [out:json][timeout:${OVERPASS_TIMEOUT_S}];
    area["boundary"="administrative"]["name"="${safeCity}"]->.searchArea;
    (
      relation["boundary"="administrative"]["admin_level"="10"](area.searchArea);
      relation["boundary"="administrative"]["admin_level"="9"](area.searchArea);
    );
    out tags bb;
  `;

  const data = await callOverpass(query);
  let zones: OsmZone[] = (data.elements ?? [])
    .filter((e) => e.type === 'relation' && e.tags?.name && e.bounds)
    .map((e) => ({
      osm_relation_id: e.id,
      name: e.tags!.name,
      admin_level: parseInt(e.tags!.admin_level ?? '10', 10),
      bbox: {
        minLat: e.bounds!.minlat,
        minLon: e.bounds!.minlon,
        maxLat: e.bounds!.maxlat,
        maxLon: e.bounds!.maxlon,
      },
    }));

  // If we got both level 9 and 10, prefer level 10 (smaller / arrondissements)
  if (zones.some((z) => z.admin_level === 10)) {
    zones = zones.filter((z) => z.admin_level === 10);
  }

  // Fallback: no sub-areas → use the city itself as a single zone.
  if (zones.length === 0) {
    const fallback = `
      [out:json][timeout:${OVERPASS_TIMEOUT_S}];
      relation["boundary"="administrative"]["name"="${safeCity}"]["admin_level"~"^(7|8)$"];
      out tags bb;
    `;
    const fb = await callOverpass(fallback);
    zones = (fb.elements ?? [])
      .filter((e) => e.type === 'relation' && e.bounds)
      .map((e) => ({
        osm_relation_id: e.id,
        name: e.tags?.name ?? safeCity,
        admin_level: parseInt(e.tags?.admin_level ?? '8', 10),
        bbox: {
          minLat: e.bounds!.minlat,
          minLon: e.bounds!.minlon,
          maxLat: e.bounds!.maxlat,
          maxLon: e.bounds!.maxlon,
        },
      }));
  }

  // Sort by name for stable display
  zones.sort((a, b) =>
    a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' })
  );
  return zones;
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
