import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyCookieValue } from '../../auth/route';

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

// PATCH /api/ambassadeur/[code]/visits/[id] — edit own visit
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string; id: string }> }
) {
  const { code, id } = await params;
  const ambassadorId = await authenticate(req, code);
  if (!ambassadorId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from('salon_visits')
    .select('id, ambassador_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing || existing.ambassador_id !== ambassadorId) {
    return NextResponse.json({ error: 'Visite introuvable' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  const update: {
    flyer_left?: boolean;
    convinced?: 'yes' | 'maybe' | 'no';
    likelihood_rating?: number;
    notes?: string | null;
    follow_up_at?: string | null;
  } = {};

  if (typeof body.flyerLeft === 'boolean') update.flyer_left = body.flyerLeft;
  if (body.convinced === 'yes' || body.convinced === 'maybe' || body.convinced === 'no') {
    update.convinced = body.convinced;
  }
  if (Number.isInteger(body.likelihoodRating)
      && body.likelihoodRating >= 1 && body.likelihoodRating <= 3) {
    update.likelihood_rating = body.likelihoodRating;
  }
  if (typeof body.notes === 'string') {
    update.notes = body.notes.slice(0, 1000).trim() || null;
  } else if (body.notes === null) {
    update.notes = null;
  }
  if (typeof body.followUpAt === 'string' || body.followUpAt === null) {
    update.follow_up_at = body.followUpAt || null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from('salon_visits').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/ambassadeur/[code]/visits/[id] — delete own visit
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ code: string; id: string }> }
) {
  const { code, id } = await params;
  const ambassadorId = await authenticate(req, code);
  if (!ambassadorId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('salon_visits')
    .select('id, ambassador_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing || existing.ambassador_id !== ambassadorId) {
    return NextResponse.json({ error: 'Visite introuvable' }, { status: 404 });
  }
  const { error } = await supabase.from('salon_visits').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
