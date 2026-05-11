import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

function getSessionSecret(): string {
  const s = process.env.AMBASSADOR_SESSION_SECRET;
  if (!s) throw new Error('AMBASSADOR_SESSION_SECRET is not set');
  return s;
}

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

function signCookie(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function buildCookieValue(ambassadorId: string, code: string, secret: string): string {
  const payload = `${ambassadorId}:${code.toLowerCase()}`;
  const sig = signCookie(payload, secret);
  return `${payload}.${sig}`;
}

export function verifyCookieValue(
  cookieValue: string,
  expectedCode: string,
  secret: string
): { valid: boolean; ambassadorId: string | null } {
  try {
    const lastDot = cookieValue.lastIndexOf('.');
    if (lastDot === -1) return { valid: false, ambassadorId: null };
    const payload = cookieValue.slice(0, lastDot);
    const sig = cookieValue.slice(lastDot + 1);

    const expectedSig = signCookie(payload, secret);
    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expectedBuf.length) return { valid: false, ambassadorId: null };
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return { valid: false, ambassadorId: null };

    const [ambassadorId, payloadCode] = payload.split(':');
    if (payloadCode?.toLowerCase() !== expectedCode.toLowerCase()) {
      return { valid: false, ambassadorId: null };
    }
    return { valid: true, ambassadorId: ambassadorId ?? null };
  } catch {
    return { valid: false, ambassadorId: null };
  }
}

// POST — verify PIN, issue cookie
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const supabase = createServiceClient();

  // Rate limit: max MAX_ATTEMPTS per IP+code in 15 min
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  const ipHash = hashIp(ip);
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count } = await supabase
    .from('ambassador_pin_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .eq('code', code.toLowerCase())
    .gte('attempted_at', windowStart);

  if ((count ?? 0) >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessaie dans 15 minutes.' },
      { status: 429 }
    );
  }

  // Record attempt
  await supabase.from('ambassador_pin_attempts').insert({
    ip_hash: ipHash,
    code: code.toLowerCase(),
  });

  const body = await request.json().catch(() => ({}));
  const pin = String(body.pin ?? '');

  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN invalide' }, { status: 400 });
  }

  // Lookup ambassador via promo_code
  const { data: promoCode } = await supabase
    .from('promo_codes')
    .select('id')
    .eq('code', code.toUpperCase())
    .maybeSingle();

  if (!promoCode) {
    return NextResponse.json({ error: 'Code introuvable' }, { status: 404 });
  }

  const { data: ambassador } = await supabase
    .from('ambassadors')
    .select('id, name, pin_hash, pin_salt')
    .eq('promo_code_id', promoCode.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!ambassador) {
    return NextResponse.json({ error: 'Code introuvable' }, { status: 404 });
  }

  // Derive the salt: use stored random salt when available, fall back to
  // ambassador.id for rows created before the pin_salt migration.
  const salt = ambassador.pin_salt ?? ambassador.id;
  const candidateHash = crypto.scryptSync(pin, salt, 64);
  const storedHash = Buffer.from(ambassador.pin_hash, 'hex');
  const pinValid =
    candidateHash.length === storedHash.length &&
    crypto.timingSafeEqual(candidateHash, storedHash);

  if (!pinValid) {
    return NextResponse.json({ error: 'PIN incorrect' }, { status: 401 });
  }

  // If this ambassador still uses the legacy salt (ambassador.id), re-hash
  // with a fresh random salt now that we know the PIN is correct.
  if (!ambassador.pin_salt) {
    const newSalt = crypto.randomBytes(32).toString('hex');
    const newHash = crypto.scryptSync(pin, newSalt, 64).toString('hex');
    await supabase
      .from('ambassadors')
      .update({ pin_salt: newSalt, pin_hash: newHash })
      .eq('id', ambassador.id);
  }

  // Clear rate-limit attempts on success
  await supabase
    .from('ambassador_pin_attempts')
    .delete()
    .eq('ip_hash', ipHash)
    .eq('code', code.toLowerCase());

  let secret: string;
  try { secret = getSessionSecret(); } catch {
    return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 });
  }

  const cookieValue = buildCookieValue(ambassador.id, code, secret);
  const firstName = ambassador.name.split(' ')[0];

  const response = NextResponse.json({ ok: true, name: firstName });
  response.cookies.set('amb_session', cookieValue, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}

// GET — check existing session
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const cookieValue = request.cookies.get('amb_session')?.value;
  if (!cookieValue) {
    return NextResponse.json({ authenticated: false });
  }

  let secret: string;
  try { secret = getSessionSecret(); } catch {
    return NextResponse.json({ authenticated: false });
  }

  const { valid, ambassadorId } = verifyCookieValue(cookieValue, code, secret);
  if (!valid || !ambassadorId) {
    return NextResponse.json({ authenticated: false });
  }

  // Fetch name for the welcome message
  const supabase = createServiceClient();
  const { data: ambassador } = await supabase
    .from('ambassadors')
    .select('name')
    .eq('id', ambassadorId)
    .eq('is_active', true)
    .maybeSingle();

  if (!ambassador) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({ authenticated: true, name: ambassador.name.split(' ')[0] });
}
