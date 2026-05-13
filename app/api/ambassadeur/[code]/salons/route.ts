import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyCookieValue } from '../auth/route';

export const runtime = 'nodejs';

async function authenticate(req: NextRequest, code: string) {
  const cookieValue = req.cookies.get('amb_session')?.value;
  if (!cookieValue) return null;
  const secret = process.env.AMBASSADOR_SESSION_SECRET;
  if (!secret) return null;
  const { valid, ambassadorId } = verifyCookieValue(cookieValue, code, secret);
  if (!valid || !ambassadorId) return null;
  return ambassadorId;
}

// GET /api/ambassadeur/[code]/salons
// Returns the salons of the ambassador's currently claimed zone, with visit status.
//   - notVisited: salons with no visit yet
//   - visited: salons visited (by anyone), with first/last visit info + best rating
//   - myVisited: salons that *this ambassador* has visited (shown for follow-up)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const ambassadorId = await authenticate(req, code);
  if (!ambassadorId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: claim } = await supabase
    .from('ambassador_zone_claims')
    .select('zone_id, salon_zones(id, name, city)')
    .eq('ambassador_id', ambassadorId)
    .is('released_at', null)
    .maybeSingle();

  if (!claim) {
    return NextResponse.json({ zone: null, salons: [] });
  }

  const zone = claim.salon_zones as
    | { id: string; name: string; city: string }
    | { id: string; name: string; city: string }[]
    | null;
  const z = Array.isArray(zone) ? zone[0] : zone;

  const { data: salons } = await supabase
    .from('salons')
    .select('id, name, address, postal_code, phone, website, lat, lon')
    .eq('zone_id', claim.zone_id)
    .eq('is_active', true)
    .order('name');

  const salonIds = (salons ?? []).map((s) => s.id);

  const { data: visits } = salonIds.length
    ? await supabase
        .from('salon_visits')
        .select('salon_id, ambassador_id, visited_at, flyer_left, convinced, likelihood_rating, notes')
        .in('salon_id', salonIds)
        .order('visited_at', { ascending: false })
    : { data: [] as Array<{
        salon_id: string;
        ambassador_id: string;
        visited_at: string;
        flyer_left: boolean;
        convinced: 'yes' | 'maybe' | 'no';
        likelihood_rating: number;
        notes: string | null;
      }> };

  // Aggregate per salon (latest visit + best rating)
  const visitsBySalon: Record<string, {
    lastVisitAt: string;
    bestRating: number;
    bestConvinced: 'yes' | 'maybe' | 'no';
    flyerLeft: boolean;
    visitedByMe: boolean;
    myLatestNotes: string | null;
  }> = {};

  const rank: Record<'no' | 'maybe' | 'yes', number> = { no: 0, maybe: 1, yes: 2 };

  for (const v of visits ?? []) {
    const existing = visitsBySalon[v.salon_id];
    if (!existing) {
      visitsBySalon[v.salon_id] = {
        lastVisitAt: v.visited_at,
        bestRating: v.likelihood_rating,
        bestConvinced: v.convinced,
        flyerLeft: v.flyer_left,
        visitedByMe: v.ambassador_id === ambassadorId,
        myLatestNotes: v.ambassador_id === ambassadorId ? v.notes : null,
      };
    } else {
      if (new Date(v.visited_at) > new Date(existing.lastVisitAt)) {
        existing.lastVisitAt = v.visited_at;
      }
      if (v.likelihood_rating > existing.bestRating) existing.bestRating = v.likelihood_rating;
      if (rank[v.convinced] > rank[existing.bestConvinced]) existing.bestConvinced = v.convinced;
      if (v.flyer_left) existing.flyerLeft = true;
      if (v.ambassador_id === ambassadorId) {
        existing.visitedByMe = true;
        if (!existing.myLatestNotes && v.notes) existing.myLatestNotes = v.notes;
      }
    }
  }

  const enriched = (salons ?? []).map((s) => {
    const v = visitsBySalon[s.id];
    return {
      id: s.id,
      name: s.name,
      address: s.address,
      postal_code: s.postal_code,
      phone: s.phone,
      website: s.website,
      lat: s.lat,
      lon: s.lon,
      visit: v
        ? {
            lastVisitAt: v.lastVisitAt,
            bestRating: v.bestRating,
            bestConvinced: v.bestConvinced,
            flyerLeft: v.flyerLeft,
            visitedByMe: v.visitedByMe,
            myNotes: v.myLatestNotes,
          }
        : null,
    };
  });

  return NextResponse.json({
    zone: z ? { id: z.id, name: z.name, city: z.city } : null,
    salons: enriched,
  });
}
