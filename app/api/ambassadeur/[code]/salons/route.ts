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
// Returns every active salon in the ambassador's city, with visit status.
// (Zones were removed — ambassadors canvass salons directly.)
//   - visit: latest visit info + best rating (by anyone), or null
//   - visit.visitedByMe: whether *this ambassador* logged one of the visits
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

  const { data: amb } = await supabase
    .from('ambassadors')
    .select('id, city, is_active')
    .eq('id', ambassadorId)
    .single();

  if (!amb?.is_active) {
    return NextResponse.json({ error: 'Compte inactif' }, { status: 403 });
  }

  // Salons: the ambassador's city if set, else every active salon.
  const cityFilter = amb.city?.trim() || null;

  let salonsQuery = supabase
    .from('salons')
    .select('id, name, category, converted_at, address, postal_code, phone, website, lat, lon, opening_hours, business_status, google_rating')
    .eq('is_active', true)
    .order('name')
    .range(0, 9999);
  if (cityFilter) salonsQuery = salonsQuery.eq('city', cityFilter);

  const { data: salons } = await salonsQuery;

  const salonIds = (salons ?? []).map((s) => s.id);

  const { data: visits } = salonIds.length
    ? await supabase
        .from('salon_visits')
        .select('salon_id, ambassador_id, visited_at, flyer_left, convinced, likelihood_rating, notes')
        .in('salon_id', salonIds)
        .range(0, 99999)
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
    const convinced = v.convinced as 'no' | 'maybe' | 'yes';
    if (!existing) {
      visitsBySalon[v.salon_id] = {
        lastVisitAt: v.visited_at,
        bestRating: v.likelihood_rating,
        bestConvinced: convinced,
        flyerLeft: v.flyer_left,
        visitedByMe: v.ambassador_id === ambassadorId,
        myLatestNotes: v.ambassador_id === ambassadorId ? v.notes : null,
      };
    } else {
      if (new Date(v.visited_at) > new Date(existing.lastVisitAt)) {
        existing.lastVisitAt = v.visited_at;
      }
      if (v.likelihood_rating > existing.bestRating) existing.bestRating = v.likelihood_rating;
      if (rank[convinced] > rank[existing.bestConvinced]) existing.bestConvinced = convinced;
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
      category: s.category,
      converted: s.converted_at != null,
      address: s.address,
      postal_code: s.postal_code,
      phone: s.phone,
      website: s.website,
      lat: s.lat,
      lon: s.lon,
      opening_hours: s.opening_hours,
      business_status: s.business_status,
      google_rating: s.google_rating,
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

  return NextResponse.json({ city: amb.city, salons: enriched });
}
