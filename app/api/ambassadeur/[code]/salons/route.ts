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

/**
 * Fetch a table in a single large page. This project's PostgREST has no
 * server-side max-rows cap (`db_max_rows` is unset), so one request returns the
 * whole table — far cheaper than the old 1000-row chunked loop, which issued
 * ~30 sequential round-trips for the salons table alone. The loop is kept only
 * as a safety net for the (currently impossible) >100k-row case.
 */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const chunkSize = 100000;
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data } = await build(from, from + chunkSize - 1);
    const rows = data ?? [];
    for (const r of rows) out.push(r);
    if (rows.length < chunkSize) break;
    from += chunkSize;
    if (from > 1000000) break; // hard safety cap
  }
  return out;
}

type SalonRow = {
  id: string;
  name: string;
  category: string;
  converted_at: string | null;
  address: string | null;
  postal_code: string | null;
  phone: string | null;
  website: string | null;
  lat: number | null;
  lon: number | null;
  opening_hours: unknown;
  business_status: string | null;
  google_rating: number | null;
};

type VisitRow = {
  salon_id: string;
  ambassador_id: string;
  visited_at: string;
  flyer_left: boolean;
  convinced: string;
  likelihood_rating: number;
  notes: string | null;
};

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

  // Effective city: the ambassador's assigned city, else one passed by the
  // client (?city=). Without either we don't load all of France — we return the
  // list of available cities so the UI can show a picker.
  const url = new URL(req.url);
  const requestedCity = url.searchParams.get('city')?.trim() || null;
  const effectiveCity = amb.city?.trim() || requestedCity;

  if (!effectiveCity) {
    // Distinct active-salon cities, deduped + counted server-side. A single
    // light query (one column) — the result sent to the client is just ~758
    // city rows, never the 30k salons.
    const rows = await fetchAll<{ city: string | null }>((from, to) =>
      supabase
        .from('salons')
        .select('city')
        .eq('is_active', true)
        .range(from, to)
    );
    const counts = new Map<string, number>();
    for (const r of rows) {
      const c = r.city?.trim();
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const cities = Array.from(counts, ([city, count]) => ({ city, count }))
      .sort((a, b) => a.city.localeCompare(b.city));
    return NextResponse.json({ city: null, needsCitySelection: true, cities, salons: [] });
  }

  // Salons for the effective city (covered by idx_salons_city).
  const salons = await fetchAll<SalonRow>((from, to) =>
    supabase
      .from('salons')
      .select('id, name, category, converted_at, address, postal_code, phone, website, lat, lon, opening_hours, business_status, google_rating')
      .eq('is_active', true)
      .eq('city', effectiveCity)
      .order('id')
      .range(from, to)
  );

  const salonIds = new Set(salons.map((s) => s.id));

  // Visits restricted to this city's salons via an inner join, so we never scan
  // the whole salon_visits table.
  const visits = await fetchAll<VisitRow>((from, to) =>
    supabase
      .from('salon_visits')
      .select('salon_id, ambassador_id, visited_at, flyer_left, convinced, likelihood_rating, notes, salons!inner(city)')
      .eq('salons.city', effectiveCity)
      .order('visited_at', { ascending: false })
      .range(from, to)
  );

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

  for (const v of visits) {
    if (!salonIds.has(v.salon_id)) continue;
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

  const enriched = salons
    .map((s) => {
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
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ city: effectiveCity, salons: enriched });
}
