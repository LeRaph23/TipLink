import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyCookieValue } from '../auth/route';

export const runtime = 'nodejs';

async function authenticateAmbassador(req: NextRequest, code: string) {
  const cookieValue = req.cookies.get('amb_session')?.value;
  if (!cookieValue) return null;
  const secret = process.env.AMBASSADOR_SESSION_SECRET;
  if (!secret) return null;
  const { valid, ambassadorId } = verifyCookieValue(cookieValue, code, secret);
  if (!valid || !ambassadorId) return null;
  return ambassadorId;
}

// GET /api/ambassadeur/[code]/zones
// Returns every active zone of the ambassador's city, each with its salon
// counts. Zones are a browsing aid only — there is no exclusive reservation,
// so any ambassador can open any zone.
//   { city, zones: [{ id, city, name, salonCount, todoCount, bbox }] }
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const ambassadorId = await authenticateAmbassador(req, code);
  if (!ambassadorId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: amb } = await supabase
    .from('ambassadors')
    .select('id, city, is_active')
    .eq('id', ambassadorId)
    .single();

  if (!amb?.is_active) {
    return NextResponse.json({ error: 'Compte inactif' }, { status: 403 });
  }

  // Zones: the ambassador's city if set, else every city with zones.
  const cityFilter = amb.city?.trim() || null;

  let zonesQuery = supabase
    .from('salon_zones')
    .select('id, city, name, bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon')
    .eq('is_active', true)
    .order('city')
    .order('name');
  if (cityFilter) zonesQuery = zonesQuery.eq('city', cityFilter);

  const { data: allZones } = await zonesQuery;
  const zoneIds = (allZones ?? []).map((z) => z.id);

  // Per-zone counts: total active salons, and how many are still to canvass
  // (no visit logged by anyone — a salon visited by another ambassador counts
  // as done since zones are shared).
  const { data: salons } = zoneIds.length
    ? await supabase
        .from('salons')
        .select('id, zone_id')
        .in('zone_id', zoneIds)
        .eq('is_active', true)
        .range(0, 99999)
    : { data: [] as Array<{ id: string; zone_id: string | null }> };

  const salonIds = (salons ?? []).map((s) => s.id);
  const { data: visits } = salonIds.length
    ? await supabase
        .from('salon_visits')
        .select('salon_id')
        .in('salon_id', salonIds)
        .range(0, 199999)
    : { data: [] as Array<{ salon_id: string }> };

  const visitedSalonIds = new Set((visits ?? []).map((v) => v.salon_id));

  const salonCountByZone = new Map<string, number>();
  const todoCountByZone = new Map<string, number>();
  for (const s of salons ?? []) {
    if (!s.zone_id) continue;
    salonCountByZone.set(s.zone_id, (salonCountByZone.get(s.zone_id) ?? 0) + 1);
    if (!visitedSalonIds.has(s.id)) {
      todoCountByZone.set(s.zone_id, (todoCountByZone.get(s.zone_id) ?? 0) + 1);
    }
  }

  const zones = (allZones ?? []).map((z) => ({
    id: z.id,
    city: z.city,
    name: z.name,
    salonCount: salonCountByZone.get(z.id) ?? 0,
    todoCount: todoCountByZone.get(z.id) ?? 0,
    bbox:
      z.bbox_min_lat != null && z.bbox_min_lon != null && z.bbox_max_lat != null && z.bbox_max_lon != null
        ? {
            minLat: Number(z.bbox_min_lat),
            minLon: Number(z.bbox_min_lon),
            maxLat: Number(z.bbox_max_lat),
            maxLon: Number(z.bbox_max_lon),
          }
        : null,
  }));

  return NextResponse.json({ city: amb.city, zones });
}
