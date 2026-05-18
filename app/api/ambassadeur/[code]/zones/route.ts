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
// Returns every active zone that has establishments, each with its counts.
// Zones are a browsing aid only — no exclusive reservation.
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

  // Zone metadata + per-zone counts are computed in one SQL pass — the function
  // returns only zones that actually have establishments. Counting client-side
  // would mean reading thousands of rows through PostgREST (row-capped) and an
  // in(...) filter on every id, which silently fails at scale.
  const { data: rows, error } = await supabase.rpc('ambassador_zone_counts');
  if (error) {
    return NextResponse.json({ error: 'Erreur de chargement des zones' }, { status: 500 });
  }

  // When the ambassador has a city set, scope the picker to it; otherwise show
  // every zone with establishments.
  const cityFilter = amb.city?.trim() || null;

  const zones = (rows ?? [])
    .filter((z) => !cityFilter || z.city === cityFilter)
    .map((z) => ({
      id: z.zone_id,
      city: z.city,
      name: z.name,
      salonCount: Number(z.salon_count),
      todoCount: Number(z.todo_count),
      bbox:
        z.bbox_min_lat != null && z.bbox_min_lon != null && z.bbox_max_lat != null && z.bbox_max_lon != null
          ? {
              minLat: Number(z.bbox_min_lat),
              minLon: Number(z.bbox_min_lon),
              maxLat: Number(z.bbox_max_lat),
              maxLon: Number(z.bbox_max_lon),
            }
          : null,
    }))
    .sort((a, b) => a.city.localeCompare(b.city, 'fr') || a.name.localeCompare(b.name, 'fr'));

  return NextResponse.json({ city: amb.city, zones });
}
