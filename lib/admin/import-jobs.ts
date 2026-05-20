// Background-job machinery for the super-admin "Établissements & zones" page.
//
// The legacy flow ran imports synchronously inside server actions driven by
// the browser. Closing the tab killed the run, progress was tracked only on
// the client, and `useTransition` gated the whole page while one action ran.
//
// New flow: every action creates an `import_jobs` row and pings a worker
// route. The worker processes one ~30s chunk inside `after()`, persists
// progress, and re-pokes itself if more work remains. The page polls the
// table for a live progress bar. Jobs survive page reloads and tab closes.

import { getBaseUrl } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/service';
import type { Json } from '@/types/database';

export type ImportJobType =
  | 'import_zones'
  | 'import_salons'
  | 'enrich_addresses'
  | 'enrich_google'
  | 'full_import';

export type ImportJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

// Discriminated union — the narrowest typing for `params` per job type.
export type ImportJobParams =
  | { type: 'import_zones';     city: string }
  | { type: 'import_salons';    zoneIds: string[] }
  | { type: 'enrich_addresses'; zoneIds: string[]; force?: boolean }
  | { type: 'enrich_google';    zoneIds: string[]; force?: boolean }
  | { type: 'full_import';      zoneIds: string[] };

// Shape returned to the UI by `listImportJobs`.
export type ImportJobView = {
  id: string;
  type: ImportJobType;
  status: ImportJobStatus;
  params: ImportJobParams;
  total: number;
  done: number;
  succeeded: number;
  failed: number;
  currentStep: string | null;
  result: Record<string, unknown>;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  lastHeartbeatAt: string | null;
  error: string | null;
};

// ─── Create + poke ───────────────────────────────────────────────────────────

/**
 * Insert a job row and trigger the worker. The fetch is awaited so the caller
 * doesn't return before the worker has acknowledged — but the worker route
 * itself responds in <100 ms (work happens in `after()`), so this is cheap.
 */
export async function createJob(
  params: ImportJobParams,
  createdBy: string | null
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('import_jobs')
    .insert({
      type: params.type,
      params: params as unknown as Json,
      created_by: createdBy,
    })
    .select('id, worker_token')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Erreur DB' };

  await pokeWorker(data.id, data.worker_token);
  return { ok: true, id: data.id };
}

/**
 * Fire a POST at the worker route. Awaits only until the route responds —
 * it returns 200 immediately because work happens inside `after()`. The 15 s
 * timeout is generous enough for a Vercel cold-start (5-10 s) yet leaves the
 * caller comfortable headroom under its own 60 s maxDuration (a chunk that
 * spent ~35 s working still has ~25 s to wait for headers + a couple of DB
 * writes). When the timeout does fire, the auto-resume in `listImportJobs`
 * re-pokes the job on the next panel poll.
 */
export async function pokeWorker(jobId: string, workerToken: string): Promise<void> {
  const url = `${getBaseUrl()}/api/admin/import-jobs/worker`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, workerToken }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    /* let the auto-resume on next list-jobs poll pick this back up */
  }
}
