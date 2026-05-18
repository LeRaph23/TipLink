import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyCookieValue } from '../auth/route';

export const runtime = 'nodejs';

// A visit is GPS-verified when the device location captured at log time is
// within this radius of the salon. Salon coordinates come from OSM and the
// phone fix has its own error margin, so the radius is generous.
const VISIT_GPS_RADIUS_M = 150;

/** Great-circle distance between two lat/lon points, in metres. */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function authenticate(req: NextRequest, code: string) {
  const cookieValue = req.cookies.get('amb_session')?.value;
  if (!cookieValue) return null;
  const secret = process.env.AMBASSADOR_SESSION_SECRET;
  if (!secret) return null;
  const { valid, ambassadorId } = verifyCookieValue(cookieValue, code, secret);
  if (!valid || !ambassadorId) return null;
  return ambassadorId;
}

// GET /api/ambassadeur/[code]/visits — full history for this ambassador
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
  const { data: visits } = await supabase
    .from('salon_visits')
    .select(
      'id, salon_id, visited_at, flyer_left, convinced, likelihood_rating, notes, follow_up_at, salons(id, name, city, address)'
    )
    .eq('ambassador_id', ambassadorId)
    .order('visited_at', { ascending: false })
    .limit(200);

  const rows = (visits ?? []).map((v) => {
    const s = v.salons as
      | { id: string; name: string; city: string; address: string | null }
      | { id: string; name: string; city: string; address: string | null }[]
      | null;
    const salon = Array.isArray(s) ? s[0] : s;
    return {
      id: v.id,
      salonId: v.salon_id,
      salonName: salon?.name ?? null,
      salonCity: salon?.city ?? null,
      salonAddress: salon?.address ?? null,
      visitedAt: v.visited_at,
      flyerLeft: v.flyer_left,
      convinced: v.convinced,
      likelihoodRating: v.likelihood_rating,
      notes: v.notes,
      followUpAt: v.follow_up_at,
    };
  });

  return NextResponse.json({ visits: rows });
}

// POST /api/ambassadeur/[code]/visits  body: { salonId, flyerLeft, convinced, likelihoodRating, notes?, followUpAt? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const ambassadorId = await authenticate(req, code);
  if (!ambassadorId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const salonId = String(body.salonId ?? '').trim();
  const flyerLeft = Boolean(body.flyerLeft);
  const convincedRaw = String(body.convinced ?? 'no');
  const convinced: 'yes' | 'maybe' | 'no' =
    convincedRaw === 'yes' || convincedRaw === 'maybe' ? convincedRaw : 'no';
  const rating = Number(body.likelihoodRating);
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 1000).trim() || null : null;
  const followUpAt = typeof body.followUpAt === 'string' && body.followUpAt
    ? body.followUpAt
    : null;

  // GPS check-in captured by the browser at log time (optional — the
  // ambassador may have denied location or be somewhere with no fix).
  const gps = body.gps && typeof body.gps === 'object' ? body.gps : null;
  const gpsLat = gps && Number.isFinite(Number(gps.lat)) ? Number(gps.lat) : null;
  const gpsLon = gps && Number.isFinite(Number(gps.lon)) ? Number(gps.lon) : null;
  const gpsAccuracy = gps && Number.isFinite(Number(gps.accuracy)) ? Number(gps.accuracy) : null;

  // Optional: flag this establishment as a client (converted) or clear the
  // flag. When absent, the conversion state is left untouched.
  const markConverted = typeof body.converted === 'boolean' ? body.converted : null;

  if (!salonId) return NextResponse.json({ error: 'salonId requis' }, { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 3) {
    return NextResponse.json({ error: 'Note 1-3 requise' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Sanity: salon must exist & be active
  const { data: salon } = await supabase
    .from('salons')
    .select('id, lat, lon, converted_at')
    .eq('id', salonId)
    .eq('is_active', true)
    .maybeSingle();
  if (!salon) return NextResponse.json({ error: 'Salon introuvable' }, { status: 404 });

  // GPS verification: compute the distance from the captured position to the
  // salon. Verified only when a fix exists, the salon has coordinates, and the
  // distance is within the radius. Everything else is left for admin review.
  let distanceM: number | null = null;
  let locationVerified = false;
  if (gpsLat != null && gpsLon != null && salon.lat != null && salon.lon != null) {
    distanceM = Math.round(haversineMeters(gpsLat, gpsLon, Number(salon.lat), Number(salon.lon)));
    locationVerified = distanceM <= VISIT_GPS_RADIUS_M;
  }

  const { data, error } = await supabase
    .from('salon_visits')
    .insert({
      ambassador_id: ambassadorId,
      salon_id: salonId,
      flyer_left: flyerLeft,
      convinced,
      likelihood_rating: rating,
      notes,
      follow_up_at: followUpAt,
      gps_lat: gpsLat,
      gps_lon: gpsLon,
      gps_accuracy_m: gpsAccuracy,
      distance_m: distanceM,
      location_verified: locationVerified,
    })
    .select('id')
    .single();

  if (error || !data) {
    if (error && (error as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'Visite déjà enregistrée pour ce salon aujourd\'hui.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error?.message ?? 'Erreur DB' }, { status: 500 });
  }

  // Apply the conversion flag only when it actually changes.
  if (markConverted !== null) {
    const alreadyConverted = salon.converted_at != null;
    if (markConverted !== alreadyConverted) {
      await supabase
        .from('salons')
        .update({ converted_at: markConverted ? new Date().toISOString() : null })
        .eq('id', salonId);
    }
  }

  return NextResponse.json({ ok: true, id: data.id });
}
