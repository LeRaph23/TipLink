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
      service.from('salon_zones').select('id, city, name, is_active, created_at').order('city').order('name'),
      service.from('salons').select('id, zone_id, city, name, address, postal_code, phone, is_active, google_enriched_at, business_status'),
      service.from('salon_visits').select('id, salon_id, ambassador_id, visited_at, flyer_left, convinced, likelihood_rating, notes, follow_up_at'),
      service.from('ambassador_zone_claims').select('id, ambassador_id, zone_id, claimed_at, released_at').is('released_at', null),
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
      />
    </div>
  );
}
