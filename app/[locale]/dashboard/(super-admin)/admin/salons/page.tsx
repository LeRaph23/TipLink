import { setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { SalonsManager } from './SalonsManager';

export default async function AdminSalonsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);

  const service = createServiceClient();

  const [{ data: zones }, { data: salons }, { data: visits }, { data: claims }, { data: ambassadors }] =
    await Promise.all([
      service.from('salon_zones')
        .select('id, city, name, is_active, created_at, bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon')
        .order('city').order('name'),
      service.from('salons')
        .select('id, zone_id, city, name, address, postal_code, phone, is_active, google_enriched_at, business_status, lat, lon, opening_hours, google_rating'),
      service.from('salon_visits')
        .select('id, salon_id, ambassador_id, visited_at, flyer_left, convinced, likelihood_rating, notes, follow_up_at'),
      service.from('ambassador_zone_claims')
        .select('id, ambassador_id, zone_id, claimed_at, released_at')
        .is('released_at', null),
      service.from('ambassadors').select('id, name'),
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
  for (const [, c] of byCity) {
    for (const s of salons ?? []) {
      if (s.city !== c.city) continue;
      if (visitedSalonIds.has(s.id)) c.salonsVisited += 1;
      if (hotSalonIds.has(s.id)) c.salonsHot += 1;
    }
  }

  const ambassadorById = new Map((ambassadors ?? []).map((a) => [a.id, a.name]));
  const zoneById = new Map((zones ?? []).map((z) => [z.id, z]));
  const claimByZone = new Map((claims ?? []).map((c) => [c.zone_id, c]));

  // Visits per salon, sorted newest first — used by the map popup
  const visitsBySalon = new Map<string, Array<{
    id: string; ambassadorId: string; ambassadorName: string;
    visitedAt: string; likelihoodRating: number;
    convinced: 'yes' | 'maybe' | 'no'; notes: string | null;
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

  const mapZones = (zones ?? []).map((z) => {
    const claim = claimByZone.get(z.id);
    return {
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
      claimedByAmbassadorId: claim?.ambassador_id ?? null,
      claimedByAmbassadorName: claim ? (ambassadorById.get(claim.ambassador_id) ?? null) : null,
    };
  });

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          Salons & zones
        </h1>
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
        activeClaims={(claims ?? []).map((c) => ({
          zoneId: c.zone_id,
          ambassadorId: c.ambassador_id,
          ambassadorName: ambassadorById.get(c.ambassador_id) ?? '—',
          claimedAt: c.claimed_at,
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
        }))}
        mapSalons={mapSalons}
        mapZones={mapZones}
      />
    </div>
  );
}
