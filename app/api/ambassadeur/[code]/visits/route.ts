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

  if (!salonId) return NextResponse.json({ error: 'salonId requis' }, { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 3) {
    return NextResponse.json({ error: 'Note 1-3 requise' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Sanity: salon must exist & be active
  const { data: salon } = await supabase
    .from('salons')
    .select('id, zone_id')
    .eq('id', salonId)
    .eq('is_active', true)
    .maybeSingle();
  if (!salon) return NextResponse.json({ error: 'Salon introuvable' }, { status: 404 });

  // Optional: enforce that the ambassador has the salon's zone claimed
  if (salon.zone_id) {
    const { data: claim } = await supabase
      .from('ambassador_zone_claims')
      .select('zone_id')
      .eq('ambassador_id', ambassadorId)
      .eq('zone_id', salon.zone_id)
      .is('released_at', null)
      .maybeSingle();
    if (!claim) {
      return NextResponse.json(
        { error: 'Tu n\'as pas réservé la zone de ce salon.' },
        { status: 403 }
      );
    }
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

  return NextResponse.json({ ok: true, id: data.id });
}
