import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { registerPinAttempt } from '@/lib/auth/pin-attempts';
import {
  COMMERCIAL_COOKIE,
  buildCommercialCookieValue,
  getCommercialSessionSecret,
  verifyCommercialCookieValue,
} from '@/lib/auth/commercial-session';

export const runtime = 'nodejs';

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

// POST — verify PIN and issue the commercial session cookie.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const supabase = createServiceClient();

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  const ipHash = hashIp(ip);

  // Recorded and counted atomically before the PIN is looked at.
  const verdict = await registerPinAttempt(supabase, 'commercial', code, ipHash);
  if (!verdict.ok) {
    if (verdict.reason === 'error') {
      return NextResponse.json({ error: 'Service momentanément indisponible. Réessayez dans un instant.' }, { status: 503 });
    }
    return NextResponse.json(
      { error: verdict.reason === 'ip' ? 'Trop de tentatives. Réessayez dans 15 minutes.' : 'Trop de tentatives sur ce code. Réessayez plus tard.' },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const pin = String(body.pin ?? '');

  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN invalide' }, { status: 400 });
  }

  const { data: promoCode } = await supabase
    .from('promo_codes')
    .select('id')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (!promoCode) {
    return NextResponse.json({ error: 'Code introuvable' }, { status: 404 });
  }

  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('id, name, pin_hash, pin_salt')
    .eq('promo_code_id', promoCode.id)
    .eq('is_active', true)
    .maybeSingle();
  if (!commercial) {
    return NextResponse.json({ error: 'Code introuvable' }, { status: 404 });
  }

  if (!commercial.pin_hash) {
    return NextResponse.json(
      { error: "PIN non défini. Utilisez le lien d'activation reçu de Digitip.", needsSetup: true },
      { status: 409 },
    );
  }

  const salt = commercial.pin_salt ?? commercial.id;
  const candidateHash = crypto.scryptSync(pin, salt, 64);
  const storedHash = Buffer.from(commercial.pin_hash, 'hex');
  const pinValid =
    candidateHash.length === storedHash.length &&
    crypto.timingSafeEqual(candidateHash, storedHash);

  if (!pinValid) {
    return NextResponse.json({ error: 'PIN incorrect' }, { status: 401 });
  }

  // Clear rate-limit attempts on success
  await supabase
    .from('commercial_pin_attempts')
    .delete()
    .eq('ip_hash', ipHash)
    .eq('code', code.toLowerCase());

  let secret: string;
  try { secret = getCommercialSessionSecret(); } catch {
    return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 });
  }

  const cookieValue = buildCommercialCookieValue(commercial.id, code, secret);
  const firstName = commercial.name.split(' ')[0];

  const response = NextResponse.json({ ok: true, name: firstName });
  response.cookies.set(COMMERCIAL_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}

// GET — check existing session
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const cookieValue = request.cookies.get(COMMERCIAL_COOKIE)?.value;
  if (!cookieValue) return NextResponse.json({ authenticated: false });

  let secret: string;
  try { secret = getCommercialSessionSecret(); } catch {
    return NextResponse.json({ authenticated: false });
  }

  const { valid, commercialId } = verifyCommercialCookieValue(cookieValue, code, secret);
  if (!valid || !commercialId) return NextResponse.json({ authenticated: false });

  const supabase = createServiceClient();
  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('name')
    .eq('id', commercialId)
    .eq('is_active', true)
    .maybeSingle();
  if (!commercial) return NextResponse.json({ authenticated: false });

  return NextResponse.json({
    authenticated: true,
    name: commercial.name.split(' ')[0],
  });
}
