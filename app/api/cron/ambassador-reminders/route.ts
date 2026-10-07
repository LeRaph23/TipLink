import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sendPendingApplicationsDigest } from '@/lib/email';
import { getSuperAdminEmails } from '@/lib/admin/super-admins';
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

  // Applications still unanswered after 2 days (we promise an answer within
  // 2 working days), then again after 5. The reminder goes to the Digitip
  // team, not the applicant: a pending application is waiting on us.
  // reminder_count counts these alerts, so each application is raised twice
  // at most.
  const { data: candidates } = await service
    .from('ambassador_recruitment_applications')
    .select('id, first_name, last_name, city, reminder_count, created_at')
    .eq('status', 'pending')
    .lt('reminder_count', 2);

  const due = (candidates ?? []).filter((c) => {
    const age = now - new Date(c.created_at).getTime();
    return c.reminder_count === 0 ? age > 2 * 86400000 : age > 5 * 86400000;
  });

  let sent = 0;
  if (due.length > 0) {
    const admins = await getSuperAdminEmails(service);
    try {
      await sendPendingApplicationsDigest({
        to: admins,
        applications: due.map((c) => ({
          name: [c.first_name, c.last_name].filter(Boolean).join(' '),
          city: c.city,
          createdAt: c.created_at,
        })),
      });
      for (const c of due) {
        await service
          .from('ambassador_recruitment_applications')
          .update({ reminder_count: c.reminder_count + 1, last_reminder_at: new Date().toISOString() })
          .eq('id', c.id);
      }
      sent = due.length;
    } catch (e) {
      console.error('pending applications digest failed', e);
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

  // Piggyback: resume stalled OSM import jobs (Hobby plan has no minute-grain
  // cron, so daily routes each take one recovery checkpoint).
  let importResumed = 0;
  try {
    const { resumeStalledImportJobs } = await import('@/lib/admin/import-jobs');
    const r = await resumeStalledImportJobs();
    importResumed = r.resumed;
  } catch { /* never break the reminders run */ }

  return NextResponse.json({
    ok: true,
    considered: candidates?.length ?? 0,
    flagged: sent,
    challengesSettled,
    importResumed,
  });
}
