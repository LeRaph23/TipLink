import { setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { SalonsManager } from './SalonsManager';

// Always render dynamic — never serve a stale RSC payload.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Fetch a Supabase table in chunks of 1000 to bypass any PostgREST
 * server-side max-rows limit (Supabase defaults to 1000 on some projects).
 * Re-runs the same builder until fewer rows than the chunk size come back.
 */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const chunkSize = 1000;
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data } = await build(from, from + chunkSize - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < chunkSize) break;
    from += chunkSize;
    if (from > 500000) break; // hard safety cap
  }
  return out;
}

export default async function AdminSalonsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);

  const service = createServiceClient();

  const [zones, salons, visits, ambassadors] = await Promise.all([
    fetchAll<{ id: string; city: string; name: string; is_active: boolean; created_at: string; bbox_min_lat: number | null; bbox_min_lon: number | null; bbox_max_lat: number | null; bbox_max_lon: number | null }>(
      (a, b) => service.from('salon_zones')
        .select('id, city, name, is_active, created_at, bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon')
        .order('city').order('name')
        .range(a, b)
    ),
    fetchAll<{
      id: string; zone_id: string | null; city: string; name: string;
      address: string | null; postal_code: string | null; phone: string | null;
      is_active: boolean; google_enriched_at: string | null;
      business_status: string | null;
      lat: number | null; lon: number | null;
      opening_hours: unknown; google_rating: number | null;
    }>(
      (a, b) => service.from('salons')
        .select('id, zone_id, city, name, address, postal_code, phone, is_active, google_enriched_at, business_status, lat, lon, opening_hours, google_rating')
        .order('id')
        .range(a, b)
    ),
    fetchAll<{
      id: string; salon_id: string; ambassador_id: string; visited_at: string;
      flyer_left: boolean; convinced: string; likelihood_rating: number;
      notes: string | null; follow_up_at: string | null;
      location_verified: boolean; distance_m: number | null;
    }>(
      (a, b) => service.from('salon_visits')
        .select('id, salon_id, ambassador_id, visited_at, flyer_left, convinced, likelihood_rating, notes, follow_up_at, location_verified, distance_m')
        .order('id')
        .range(a, b)
    ),
    fetchAll<{ id: string; name: string }>(
      (a, b) => service.from('ambassadors').select('id, name').range(a, b)
    ),
  ]);

  // Aggregate per city
  type CityStats = {
    city: string;
    zonesTotal: number;
    salonsTotal: number;
    salonsVisited: number;
    salonsHot: number;
    visitsTotal: number;
  };
  const byCity = new Map<string, CityStats>();
  for (const z of zones ?? []) {
    if (!byCity.has(z.city)) byCity.set(z.city, {
      city: z.city, zonesTotal: 0, salonsTotal: 0, salonsVisited: 0, salonsHot: 0, visitsTotal: 0,
    });
    byCity.get(z.city)!.zonesTotal += 1;
  }
  for (const s of salons ?? []) {
    if (!byCity.has(s.city)) byCity.set(s.city, {
      city: s.city, zonesTotal: 0, salonsTotal: 0, salonsVisited: 0, salonsHot: 0, visitsTotal: 0,
    });
    byCity.get(s.city)!.salonsTotal += 1;
  }

  const salonById = new Map((salons ?? []).map((s) => [s.id, s]));
  const visitedSalonIds = new Set<string>();
  const hotSalonIds = new Set<string>(); // best rating === 3
  const visitCountBySalon = new Map<string, number>();
  for (const v of visits ?? []) {
    visitedSalonIds.add(v.salon_id);
    if (v.likelihood_rating === 3) hotSalonIds.add(v.salon_id);
    visitCountBySalon.set(v.salon_id, (visitCountBySalon.get(v.salon_id) ?? 0) + 1);
    const s = salonById.get(v.salon_id);
    if (s && byCity.has(s.city)) {
      byCity.get(s.city)!.visitsTotal += 1;
    }
  }
  for (const s of salons ?? []) {
    const c = byCity.get(s.city);
    if (!c) continue;
    if (visitedSalonIds.has(s.id)) c.salonsVisited += 1;
    if (hotSalonIds.has(s.id)) c.salonsHot += 1;
  }

  const ambassadorById = new Map((ambassadors ?? []).map((a) => [a.id, a.name]));
  const zoneById = new Map((zones ?? []).map((z) => [z.id, z]));

  // Visits per salon, sorted newest first — used by the map popup
  const visitsBySalon = new Map<string, Array<{
    id: string; ambassadorId: string; ambassadorName: string;
    visitedAt: string; likelihoodRating: number;
    convinced: 'yes' | 'maybe' | 'no'; notes: string | null;
    locationVerified: boolean; distanceM: number | null;
  }>>();
  for (const v of visits ?? []) {
    const arr = visitsBySalon.get(v.salon_id) ?? [];
    arr.push({
      id: v.id,
      ambassadorId: v.ambassador_id,
      ambassadorName: ambassadorById.get(v.ambassador_id) ?? '—',
      visitedAt: v.visited_at,
      likelihoodRating: v.likelihood_rating,
      convinced: v.convinced as 'yes' | 'maybe' | 'no',
      notes: v.notes,
      locationVerified: v.location_verified,
      distanceM: v.distance_m == null ? null : Number(v.distance_m),
    });
    visitsBySalon.set(v.salon_id, arr);
  }
  for (const arr of visitsBySalon.values()) {
    arr.sort((a, b) => +new Date(b.visitedAt) - +new Date(a.visitedAt));
  }

  const mapSalons = (salons ?? []).map((s) => {
    const zone = s.zone_id ? zoneById.get(s.zone_id) : null;
    return {
      id: s.id,
      name: s.name,
      city: s.city,
      zoneId: s.zone_id,
      zoneName: zone?.name ?? null,
      address: s.address,
      postal_code: s.postal_code,
      phone: s.phone,
      lat: s.lat == null ? null : Number(s.lat),
      lon: s.lon == null ? null : Number(s.lon),
      opening_hours: s.opening_hours as never,
      business_status: (s.business_status as 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | null) ?? null,
      google_rating: s.google_rating == null ? null : Number(s.google_rating),
      isActive: s.is_active,
      visits: visitsBySalon.get(s.id) ?? [],
    };
  });

  const mapZones = (zones ?? []).map((z) => ({
    id: z.id,
    city: z.city,
    name: z.name,
    bbox: z.bbox_min_lat != null && z.bbox_min_lon != null && z.bbox_max_lat != null && z.bbox_max_lon != null
      ? {
          minLat: Number(z.bbox_min_lat),
          minLon: Number(z.bbox_min_lon),
          maxLat: Number(z.bbox_max_lat),
          maxLon: Number(z.bbox_max_lon),
        }
      : null,
  }));

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>
          Établissements & zones
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          Import OSM, attribution des zones, suivi des visites par ambassadeur.
        </p>
      </div>

      <SalonsManager
        cityStats={Array.from(byCity.values()).sort((a, b) => a.city.localeCompare(b.city))}
        zones={(zones ?? []).map((z) => ({
          id: z.id,
          city: z.city,
          name: z.name,
          isActive: z.is_active,
        }))}
        salons={(salons ?? []).map((s) => ({
          id: s.id,
          zoneId: s.zone_id,
          city: s.city,
          name: s.name,
          address: s.address,
          postalCode: s.postal_code,
          phone: s.phone,
          isActive: s.is_active,
          visitCount: visitCountBySalon.get(s.id) ?? 0,
          googleEnriched: !!s.google_enriched_at,
          businessStatus: (s.business_status as 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | null) ?? null,
        }))}
        visits={(visits ?? []).map((v) => ({
          id: v.id,
          salonId: v.salon_id,
          salonName: salonById.get(v.salon_id)?.name ?? '—',
          salonCity: salonById.get(v.salon_id)?.city ?? '—',
          ambassadorId: v.ambassador_id,
          ambassadorName: ambassadorById.get(v.ambassador_id) ?? '—',
          visitedAt: v.visited_at,
          flyerLeft: v.flyer_left,
          convinced: v.convinced as 'yes' | 'maybe' | 'no',
          likelihoodRating: v.likelihood_rating,
          notes: v.notes,
          followUpAt: v.follow_up_at,
          locationVerified: v.location_verified,
          distanceM: v.distance_m == null ? null : Number(v.distance_m),
        }))}
        mapSalons={mapSalons}
        mapZones={mapZones}
      />
    </div>
  );
}
