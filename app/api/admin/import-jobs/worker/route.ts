// Worker route for the background import jobs.
//
// POSTs here are authenticated by the per-job `worker_token` (random 16 bytes
// generated at insert; lives only in import_jobs and in pokes from the same
// server). The route responds 200 immediately and runs the chunk in `after()`
// so the caller can disconnect — Vercel keeps the function alive up to
// maxDuration. The chunk self-reschedules by re-poking this route.

import { after } from 'next/server';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { processJobChunk } from '@/lib/admin/import-jobs-worker';

export const runtime = 'nodejs';
export const maxDuration = 60;

type WorkerBody = { jobId?: unknown; workerToken?: unknown };

export async function POST(req: Request) {
  let body: WorkerBody;
  try {
    body = (await req.json()) as WorkerBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 });
  }

  const jobId = typeof body.jobId === 'string' ? body.jobId : null;
  const token = typeof body.workerToken === 'string' ? body.workerToken : null;
  if (!jobId || !token) {
    return NextResponse.json({ ok: false, error: 'missing fields' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: job } = await service
    .from('import_jobs')
    .select('worker_token, status')
    .eq('id', jobId)
    .maybeSingle();
  if (!job) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }
  if (!safeEqual(job.worker_token, token)) {
    return NextResponse.json({ ok: false, error: 'invalid token' }, { status: 401 });
  }
  if (job.status === 'cancelled' || job.status === 'completed' || job.status === 'failed') {
    return NextResponse.json({ ok: true, terminal: true });
  }

  // Run the chunk after the response is sent so the caller can detach
  // immediately. `after` extends the function lifetime up to maxDuration.
  after(async () => {
    try {
      await processJobChunk(jobId);
    } catch (e) {
      console.error('[import-jobs] chunk crashed', e);
      try {
        await service.from('import_jobs').update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error: e instanceof Error ? e.message : 'Erreur inconnue',
        }).eq('id', jobId);
      } catch {
        /* swallow secondary failure */
      }
    }
  });

  return NextResponse.json({ ok: true });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}
