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

export type SalonCategory = 'coiffure' | 'esthetique' | 'restaurant' | 'cafe' | 'bar';

export type OsmSalon = {
  osm_id: number;
  osm_type: 'node' | 'way' | 'relation';
  category: SalonCategory;
  name: string;
  lat: number;
  lon: number;
  address: string | null;
  postal_code: string | null;
  phone: string | null;
  website: string | null;
};

/** Maps an OSM element's tags to one of our establishment categories. */
function osmCategory(t: Record<string, string>): SalonCategory | null {
  if (t.shop === 'hairdresser') return 'coiffure';
  if (t.shop === 'beauty') return 'esthetique';
  if (t.amenity === 'restaurant') return 'restaurant';
  if (t.amenity === 'cafe') return 'cafe';
  if (t.amenity === 'bar') return 'bar';
  return null;
}

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
  // The city name is interpolated into an Overpass QL string literal. Stripping
  // quotes/backslashes already prevents breaking out of the "name"="..." literal;
  // we additionally whitelist to the characters that legitimately appear in
  // French place names (letters incl. accents, digits, spaces, hyphens,
  // apostrophes, dots) so no Overpass operator can survive even if the literal
  // framing ever changes. Cap the length to bound query cost.
  const safeCity = city
    .replace(/["\\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s.'’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
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
 * Fetch establishments (hair, beauty, restaurants, cafes, bars) in the given
 * bounding box. Returns nodes + way centers; deduplicated by osm_type+osm_id.
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
      node["amenity"~"^(restaurant|cafe|bar)$"](${bboxStr});
      way["amenity"~"^(restaurant|cafe|bar)$"](${bboxStr});
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

    const category = osmCategory(t);
    if (!category) continue;

    const lat = e.type === 'node' ? e.lat : e.center?.lat;
    const lon = e.type === 'node' ? e.lon : e.center?.lon;
    if (lat == null || lon == null) continue;

    out.push({
      osm_id: e.id,
      osm_type: e.type,
      category,
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

// ─── Reverse geocoding via BAN (Base Adresse Nationale) ─────────────────────
// French government API, free, no strict rate limit. Accepts a CSV payload of
// up to ~1000 rows and returns geocoded data per row. Massively faster than
// Nominatim for French addresses (1 batch call ≈ 500 Nominatim calls ≈ 9 min).
//
// CSV input format:  id,longitude,latitude  (1 header line + N data lines)
// CSV output format: id,longitude,latitude,result_label,result_postcode,
//                    result_city,result_score,result_street,result_housenumber,…
//
// Docs: https://adresse.data.gouv.fr/api-doc/adresse  (section "API CSV")
// Endpoint accepts multipart/form-data with `data` = the CSV file. Optional
// `result_columns` to trim the response; we keep it defaulted for clarity.

const BAN_REVERSE_CSV_ENDPOINT = 'https://api-adresse.data.gouv.fr/reverse/csv/';
const BAN_MAX_BATCH = 500;          // BAN supports up to 1000; 500 keeps payloads <1MB
const BAN_TIMEOUT_MS = 60_000;       // batch CSV can take 20-30s for 500 rows
const BAN_MIN_SCORE = 0.35;          // below this the match is too rough to keep

// Parse a single CSV line respecting double-quote escaping ("a,b" stays as one field).
// BAN's response uses standard RFC 4180-ish quoting for fields that contain commas.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Batch reverse-geocode coordinates via the French BAN CSV API.
 *
 * Returns a Map keyed by input id. Coordinates BAN cannot resolve (no match,
 * or result_score < BAN_MIN_SCORE) are **absent** from the map — callers
 * should fall back to {@link reverseGeocode} (Nominatim) for those.
 *
 * Network errors are propagated; the caller decides whether to retry or fall
 * back to single-coord Nominatim.
 */
export async function reverseGeocodeBatchBan(
  coords: Array<{ id: string; lat: number; lon: number }>
): Promise<Map<string, ReverseGeocodeResult>> {
  const results = new Map<string, ReverseGeocodeResult>();
  if (coords.length === 0) return results;

  for (let i = 0; i < coords.length; i += BAN_MAX_BATCH) {
    const slice = coords.slice(i, i + BAN_MAX_BATCH);

    // BAN's reverse/csv expects columns "longitude" and "latitude" by default.
    // We pass id through so we can correlate rows back without ordering assumptions.
    const csvLines = ['id,longitude,latitude'];
    for (const c of slice) {
      csvLines.push(`${c.id},${c.lon},${c.lat}`);
    }
    const csv = csvLines.join('\n');

    const form = new FormData();
    form.append('data', new Blob([csv], { type: 'text/csv' }), 'data.csv');

    let res: Response;
    try {
      res = await fetch(BAN_REVERSE_CSV_ENDPOINT, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/csv' },
        body: form,
        signal: AbortSignal.timeout(BAN_TIMEOUT_MS),
      });
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
    if (!res.ok) {
      throw new Error(`BAN HTTP ${res.status}`);
    }

    const text = await res.text();
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) continue;

    const header = parseCsvLine(lines[0]);
    const idIdx       = header.indexOf('id');
    const labelIdx    = header.indexOf('result_label');
    const postcodeIdx = header.indexOf('result_postcode');
    const cityIdx     = header.indexOf('result_city');
    const scoreIdx    = header.indexOf('result_score');
    const streetIdx   = header.indexOf('result_street');
    const numIdx      = header.indexOf('result_housenumber');

    if (idIdx === -1) continue; // malformed response

    for (let li = 1; li < lines.length; li++) {
      const raw = lines[li];
      if (!raw) continue;
      const cells = parseCsvLine(raw);
      const id = cells[idIdx];
      if (!id) continue;

      const score = scoreIdx >= 0 ? parseFloat(cells[scoreIdx] ?? '') : 1;
      if (!Number.isFinite(score) || score < BAN_MIN_SCORE) continue;

      const street = streetIdx >= 0 ? cells[streetIdx] : '';
      const num    = numIdx    >= 0 ? cells[numIdx]    : '';
      const city   = cityIdx   >= 0 ? cells[cityIdx]   : '';
      const label  = labelIdx  >= 0 ? cells[labelIdx]  : '';
      const postal = postcodeIdx >= 0 ? cells[postcodeIdx] : '';

      // Prefer reconstructed "<num> <street>, <city>" when both pieces exist;
      // otherwise fall back to BAN's result_label which is always populated
      // on a successful match.
      let address: string | null = null;
      if (street) {
        const left = [num, street].filter(Boolean).join(' ').trim();
        address = city ? `${left}, ${city}` : left;
      } else if (label) {
        address = label;
      }

      if (!address && !postal) continue;
      results.set(id, {
        address: address || null,
        postal_code: postal || null,
      });
    }
  }

  return results;
}
