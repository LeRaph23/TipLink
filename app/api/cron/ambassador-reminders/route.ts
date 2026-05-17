import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sendAmbassadorApplicationReminder } from '@/lib/email';
import { isAuthorizedCronRequest } from '@/lib/auth/require-cron';
import { settleExpiredChallenges } from '@/lib/ambassador-monthly-challenge';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const now = Date.now();
  const twoDaysAgo = new Date(now - 2 * 86400000).toISOString();
  const fiveDaysAgo = new Date(now - 5 * 86400000).toISOString();

  const { data: candidates } = await service
    .from('ambassador_recruitment_applications')
    .select('id, first_name, email, reminder_count, created_at, last_reminder_at')
    .eq('status', 'pending')
    .lt('reminder_count', 2);

  const toRemind = (candidates ?? []).filter(c => {
    if (c.reminder_count === 0) return c.created_at < twoDaysAgo;
    if (c.reminder_count === 1) return (c.last_reminder_at ?? c.created_at) < fiveDaysAgo;
    return false;
  });

  let sent = 0;
  for (const c of toRemind) {
    const step = (c.reminder_count + 1) as 1 | 2;
    try {
      await sendAmbassadorApplicationReminder({ to: c.email, firstName: c.first_name, step });
      await service
        .from('ambassador_recruitment_applications')
        .update({ reminder_count: step, last_reminder_at: new Date().toISOString() })
        .eq('id', c.id);
      sent++;
    } catch (e) {
      console.error('reminder failed', c.id, e);
    }
  }

  // Settle any monthly challenge whose one-month window has elapsed: this picks
  // the #1 ambassador and credits their prize into the withdrawable balance.
  let challengesSettled = 0;
  try {
    challengesSettled = await settleExpiredChallenges(service);
  } catch (e) {
    console.error('monthly challenge settlement failed', e);
  }

  return NextResponse.json({
    ok: true,
    considered: candidates?.length ?? 0,
    sent,
    challengesSettled,
  });
}
