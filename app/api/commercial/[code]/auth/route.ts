import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import {
  COMMERCIAL_COOKIE,
  buildCommercialCookieValue,
  getCommercialSessionSecret,
  verifyCommercialCookieValue,
} from '@/lib/auth/commercial-session';

export const runtime = 'nodejs';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5; // per IP + code

// Global backstop across all IPs for one code — see the ambassador auth route
// for the rationale (defeats IP rotation against the 4-digit PIN).
const CODE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_CODE_ATTEMPTS = 30;

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
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count } = await supabase
    .from('commercial_pin_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .eq('code', code.toLowerCase())
    .gte('attempted_at', windowStart);

  if ((count ?? 0) >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
      { status: 429 },
    );
  }

  // Global backstop: cap total guesses for this code across every IP.
  const codeWindowStart = new Date(Date.now() - CODE_WINDOW_MS).toISOString();
  const { count: codeCount } = await supabase
    .from('commercial_pin_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('code', code.toLowerCase())
    .gte('attempted_at', codeWindowStart);

  if ((codeCount ?? 0) >= MAX_CODE_ATTEMPTS) {
    return NextResponse.json(
      { error: 'Trop de tentatives sur ce code. Réessayez dans 1 heure.' },
      { status: 429 },
    );
  }

  await supabase.from('commercial_pin_attempts').insert({
    ip_hash: ipHash,
    code: code.toLowerCase(),
  });

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
