import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { sendColdEmailStep } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 60;

const HOURLY_LIMIT = 50;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://digitip.app';

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function signSiret(siret: string): string {
  const secret = process.env.COLD_EMAIL_UNSUB_SECRET ?? process.env.CRON_SECRET ?? '';
  return crypto.createHmac('sha256', secret).update(siret).digest('hex').slice(0, 32);
}

function unsubscribeToken(siret: string): string {
  return `${siret}.${signSiret(siret)}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const now = Date.now();
  const threeDaysAgo = new Date(now - 3 * 86400000).toISOString();
  const fiveDaysAgo = new Date(now - 5 * 86400000).toISOString();

  const { data: prospects } = await service
    .from('cold_email_prospects')
    .select('id, siret, email, first_name, city, sequence_step, last_sent_at')
    .is('unsubscribed_at', null)
    .is('replied_at', null)
    .not('email', 'is', null)
    .lt('sequence_step', 3)
    .order('imported_at', { ascending: true })
    .limit(HOURLY_LIMIT * 2);

  const eligible = (prospects ?? []).filter(p => {
    if (!p.email) return false;
    if (p.sequence_step === 0) return true;
    if (p.sequence_step === 1) return (p.last_sent_at ?? '') < threeDaysAgo;
    if (p.sequence_step === 2) return (p.last_sent_at ?? '') < fiveDaysAgo;
    return false;
  }).slice(0, HOURLY_LIMIT);

  let sent = 0;
  for (const p of eligible) {
    if (!p.email) continue;
    const nextStep = (p.sequence_step + 1) as 1 | 2 | 3;
    const unsubUrl = `${APP_URL}/api/cold-email/unsubscribe/${unsubscribeToken(p.siret)}`;
    const landingUrl = `${APP_URL}/devenir-ambassadeur?utm_source=cold_email&utm_id=${p.id}`;
    try {
      const result = await sendColdEmailStep({
        to: p.email,
        firstName: p.first_name,
        city: p.city,
        step: nextStep,
        unsubscribeUrl: unsubUrl,
        landingUrl,
      });
      if (result.ok) {
        await service
          .from('cold_email_prospects')
          .update({ sequence_step: nextStep, last_sent_at: new Date().toISOString() })
          .eq('id', p.id);
        sent++;
      }
    } catch (e) {
      console.error('cold email failed', p.id, e);
    }
  }

  return NextResponse.json({ ok: true, considered: eligible.length, sent });
}
