// Cron route — auto-resume stalled import jobs.
//
// Scheduled daily at 03:00 UTC (vercel.json). Hobby plan only allows daily
// crons, so the existing daily crons (lifecycle-emails, ambassador-reminders,
// group-transfers-reconcile) also call `resumeStalledImportJobs` as a
// side-effect, giving ~4 daily recovery checkpoints. On Pro+ this route can
// be re-scheduled to hourly or finer for tighter recovery.
//
// The worker chain is normally self-driving (each chunk pokes the next) and
// the page polling re-pokes when the admin has the panel open. This cron only
// kicks in for the worst case: tab closed AND a chunk crashed before its
// re-poke fired.

import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/auth/require-cron';
import { resumeStalledImportJobs } from '@/lib/admin/import-jobs';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const { resumed } = await resumeStalledImportJobs();
  return NextResponse.json({ ok: true, resumed });
}
