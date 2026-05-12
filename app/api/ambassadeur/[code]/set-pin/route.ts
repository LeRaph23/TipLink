import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { buildCookieValue } from '../auth/route';

export const runtime = 'nodejs';

function getSessionSecret(): string {
  const s = process.env.AMBASSADOR_SESSION_SECRET;
  if (!s) throw new Error('AMBASSADOR_SESSION_SECRET is not set');
  return s;
}

// GET — validate the setup token (used by the frontend to show the right UI)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ valid: false, error: 'Token manquant' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: promoCode } = await supabase
    .from('promo_codes')
    .select('id')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (!promoCode) return NextResponse.json({ valid: false, error: 'Code introuvable' }, { status: 404 });

  const { data: amb } = await supabase
    .from('ambassadors')
    .select('id, name, pin_setup_token, pin_setup_expires_at, pin_hash')
    .eq('promo_code_id', promoCode.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!amb || !amb.pin_setup_token) {
    return NextResponse.json({ valid: false, error: 'Lien invalide ou déjà utilisé' }, { status: 410 });
  }

  // Timing-safe comparison
  const provided = Buffer.from(token);
  const stored = Buffer.from(amb.pin_setup_token);
  if (provided.length !== stored.length || !crypto.timingSafeEqual(provided, stored)) {
    return NextResponse.json({ valid: false, error: 'Lien invalide' }, { status: 410 });
  }

  if (amb.pin_setup_expires_at && new Date(amb.pin_setup_expires_at) < new Date()) {
    return NextResponse.json({ valid: false, error: 'Lien expiré' }, { status: 410 });
  }

  return NextResponse.json({
    valid: true,
    name: amb.name.split(' ')[0],
    alreadyHasPin: !!amb.pin_hash,
  });
}

// POST — consume the setup token, set the PIN, issue an auth cookie
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? '');
  const pin = String(body.pin ?? '');

  if (!token) return NextResponse.json({ error: 'Token manquant' }, { status: 400 });
  if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: 'PIN : 4 chiffres requis' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: promoCode } = await supabase
    .from('promo_codes')
    .select('id')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (!promoCode) return NextResponse.json({ error: 'Code introuvable' }, { status: 404 });

  const { data: amb } = await supabase
    .from('ambassadors')
    .select('id, name, pin_setup_token, pin_setup_expires_at')
    .eq('promo_code_id', promoCode.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!amb || !amb.pin_setup_token) {
    return NextResponse.json({ error: 'Lien invalide ou déjà utilisé' }, { status: 410 });
  }

  const provided = Buffer.from(token);
  const stored = Buffer.from(amb.pin_setup_token);
  if (provided.length !== stored.length || !crypto.timingSafeEqual(provided, stored)) {
    return NextResponse.json({ error: 'Lien invalide' }, { status: 410 });
  }

  if (amb.pin_setup_expires_at && new Date(amb.pin_setup_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Lien expiré, contacte Digitip' }, { status: 410 });
  }

  const pinSalt = crypto.randomBytes(32).toString('hex');
  const pinHash = crypto.scryptSync(pin, pinSalt, 64).toString('hex');

  const { error: updErr } = await supabase
    .from('ambassadors')
    .update({
      pin_hash: pinHash,
      pin_salt: pinSalt,
      pin_setup_token: null,
      pin_setup_expires_at: null,
    })
    .eq('id', amb.id);

  if (updErr) return NextResponse.json({ error: 'Échec enregistrement' }, { status: 500 });

  let secret: string;
  try { secret = getSessionSecret(); } catch {
    return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 });
  }

  const cookieValue = buildCookieValue(amb.id, code, secret);
  const response = NextResponse.json({ ok: true, name: amb.name.split(' ')[0] });
  response.cookies.set('amb_session', cookieValue, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
