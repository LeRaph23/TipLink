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
// Returns: { city, currentClaim, availableZones }
//   - currentClaim: { zoneId, zoneName, claimedAt } or null
//   - availableZones: zones in the ambassador's city, excluding claimed ones
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

  // Current active claim
  const { data: claim } = await supabase
    .from('ambassador_zone_claims')
    .select('id, zone_id, claimed_at, salon_zones(id, name, city)')
    .eq('ambassador_id', ambassadorId)
    .is('released_at', null)
    .maybeSingle();

  const currentZone = claim?.salon_zones as
    | { id: string; name: string; city: string }
    | { id: string; name: string; city: string }[]
    | null;
  const cz = Array.isArray(currentZone) ? currentZone[0] : currentZone;

  const currentClaim = claim && cz
    ? { zoneId: claim.zone_id, zoneName: cz.name, city: cz.city, claimedAt: claim.claimed_at }
    : null;

  // Cities available: ambassador's city if set, else all cities with zones
  const cityFilter = amb.city?.trim() || null;

  let zonesQuery = supabase
    .from('salon_zones')
    .select('id, city, name')
    .eq('is_active', true)
    .order('city')
    .order('name');
  if (cityFilter) zonesQuery = zonesQuery.eq('city', cityFilter);

  const { data: allZones } = await zonesQuery;

  // Active claims (to filter out already-claimed zones, except mine)
  const { data: activeClaims } = await supabase
    .from('ambassador_zone_claims')
    .select('zone_id')
    .is('released_at', null);

  const claimedZoneIds = new Set((activeClaims ?? []).map((c) => c.zone_id));

  const availableZones = (allZones ?? [])
    .filter((z) => !claimedZoneIds.has(z.id) || z.id === currentClaim?.zoneId)
    .map((z) => ({ id: z.id, city: z.city, name: z.name }));

  return NextResponse.json({
    city: amb.city,
    currentClaim,
    availableZones,
  });
}
