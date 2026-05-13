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

// POST /api/ambassadeur/[code]/zones/claim   body: { zoneId }
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
  const zoneId = String(body.zoneId ?? '').trim();
  if (!zoneId) {
    return NextResponse.json({ error: 'zoneId requis' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verify zone exists and is active
  const { data: zone } = await supabase
    .from('salon_zones')
    .select('id, name, city, is_active')
    .eq('id', zoneId)
    .maybeSingle();
  if (!zone || !zone.is_active) {
    return NextResponse.json({ error: 'Zone introuvable ou inactive.' }, { status: 404 });
  }

  // Block if ambassador already has an active claim
  const { data: ownClaim } = await supabase
    .from('ambassador_zone_claims')
    .select('id, zone_id')
    .eq('ambassador_id', ambassadorId)
    .is('released_at', null)
    .maybeSingle();

  if (ownClaim) {
    if (ownClaim.zone_id === zoneId) {
      return NextResponse.json({ ok: true, alreadyClaimed: true });
    }
    return NextResponse.json(
      { error: 'Tu as déjà une zone active. Libère-la avant d\'en prendre une autre.' },
      { status: 409 }
    );
  }

  // Block if zone is claimed by someone else
  const { data: takenBy } = await supabase
    .from('ambassador_zone_claims')
    .select('id')
    .eq('zone_id', zoneId)
    .is('released_at', null)
    .maybeSingle();
  if (takenBy) {
    return NextResponse.json(
      { error: 'Cette zone est déjà prise par un autre ambassadeur.' },
      { status: 409 }
    );
  }

  const { error } = await supabase.from('ambassador_zone_claims').insert({
    ambassador_id: ambassadorId,
    zone_id: zoneId,
  });
  if (error) {
    // unique-index race: another ambassador claimed it just now
    return NextResponse.json(
      { error: 'Cette zone vient d\'être prise. Choisis-en une autre.' },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
