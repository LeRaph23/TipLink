import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyCookieValue } from '../../auth/route';
import { sendReferralEmailFromAmbassador } from '@/lib/email';

export const runtime = 'nodejs';

const DAILY_LIMIT = 20;
const MAX_PER_REQUEST = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const cookieValue = request.cookies.get('amb_session')?.value;
  if (!cookieValue) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const secret = process.env.AMBASSADOR_SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: 'Configuration manquante' }, { status: 500 });

  const { valid, ambassadorId } = verifyCookieValue(cookieValue, code, secret);
  if (!valid || !ambassadorId) return NextResponse.json({ error: 'Session invalide' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const rawEmails = Array.isArray(body?.emails) ? body.emails : [];
  const cleaned: string[] = rawEmails
    .map((e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
    .filter((e: string) => EMAIL_RE.test(e));
  const emails: string[] = Array.from(new Set(cleaned)).slice(0, MAX_PER_REQUEST);

  if (emails.length === 0) {
    return NextResponse.json({ error: 'Aucun email valide.' }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: amb } = await service
    .from('ambassadors')
    .select('id, name, referral_code')
    .eq('id', ambassadorId)
    .single();
  if (!amb || !amb.referral_code) {
    return NextResponse.json({ error: 'Code parrainage indisponible.' }, { status: 400 });
  }

  const since = new Date(Date.now() - 86400000).toISOString();
  const { count: sentToday } = await service
    .from('referral_email_log')
    .select('id', { count: 'exact', head: true })
    .eq('ambassador_id', ambassadorId)
    .gte('sent_at', since);

  const remaining = Math.max(0, DAILY_LIMIT - (sentToday ?? 0));
  if (remaining === 0) {
    return NextResponse.json({ error: `Limite quotidienne atteinte (${DAILY_LIMIT} mails/jour).` }, { status: 429 });
  }
  const toSend = emails.slice(0, remaining);

  const results = await Promise.all(toSend.map(async (to) => {
    try {
      await sendReferralEmailFromAmbassador({
        to,
        parrainName: amb.name,
        referralCode: amb.referral_code!,
      });
      await service.from('referral_email_log').insert({ ambassador_id: ambassadorId, recipient_email: to });
      return { to, ok: true };
    } catch (e) {
      return { to, ok: false, error: e instanceof Error ? e.message : 'send failed' };
    }
  }));

  const sentCount = results.filter(r => r.ok).length;
  return NextResponse.json({ ok: true, sent: sentCount, results, remainingToday: remaining - sentCount });
}
