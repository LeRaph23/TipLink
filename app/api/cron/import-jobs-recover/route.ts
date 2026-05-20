// Recover background import jobs whose worker chain went silent.
//
// The primary safety net is the auto-resume inside `listImportJobs`, which
// re-pokes stalled jobs every time the admin polls the page. This cron is
// the secondary net: if nobody has the page open, jobs would still resume
// on their own within the cron cadence (set in vercel.json).
//
// "Stalled" criteria are conservative on purpose — never re-poke a job that
// might just be slow:
//   - status='running' AND last_heartbeat_at older than 90 s
//   - status='pending' older than 60 s (the initial poke never landed)
// Chunks bump the heartbeat every few items, so 90 s is well beyond any
// realistic single-chunk silence (the slowest path is Nominatim at ~5 s/item
// with a heartbeat every 5 items → 25 s).

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isAuthorizedCronRequest } from '@/lib/auth/require-cron';
import { pokeWorker } from '@/lib/admin/import-jobs';

export const runtime = 'nodejs';
export const maxDuration = 30;

const STALE_RUNNING_MS = 90_000;
const STALE_PENDING_MS = 60_000;
const MAX_RESUMES_PER_RUN = 20;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const now = Date.now();
  const runningCutoff = new Date(now - STALE_RUNNING_MS).toISOString();
  const pendingCutoff = new Date(now - STALE_PENDING_MS).toISOString();

  const { data: stalledRunning } = await service
    .from('import_jobs')
    .select('id, worker_token')
    .eq('status', 'running')
    .lt('last_heartbeat_at', runningCutoff)
    .order('last_heartbeat_at', { ascending: true })
    .limit(MAX_RESUMES_PER_RUN);

  const { data: stalledPending } = await service
    .from('import_jobs')
    .select('id, worker_token')
    .eq('status', 'pending')
    .lt('created_at', pendingCutoff)
    .order('created_at', { ascending: true })
    .limit(MAX_RESUMES_PER_RUN);

  const all = [...(stalledRunning ?? []), ...(stalledPending ?? [])];
  if (all.length === 0) {
    return NextResponse.json({ ok: true, resumed: 0 });
  }

  // Bump heartbeats first so a second cron run (or a page poll) doesn't
  // double-fire on the same jobs while these pokes are in flight.
  await service
    .from('import_jobs')
    .update({ last_heartbeat_at: new Date().toISOString() })
    .in('id', all.map((j) => j.id));

  await Promise.all(all.map((j) => pokeWorker(j.id, j.worker_token)));

  return NextResponse.json({ ok: true, resumed: all.length });
}
