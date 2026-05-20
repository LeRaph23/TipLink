'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';
import {
  createJob,
  pokeWorker,
  type ImportJobParams,
  type ImportJobView,
} from '@/lib/admin/import-jobs';

async function requireSuperAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .limit(1);
  if (!roles?.length) throw new Error('Forbidden');
  return user;
}

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

// ─── Start a job ────────────────────────────────────────────────────────────

export async function startImportJob(
  params: ImportJobParams
): Promise<Result<{ id: string }>> {
  try {
    const user = await requireSuperAdminUser();
    // Light validation — DB has the source of truth, but we want clear errors.
    if (params.type === 'import_zones' && !params.city.trim()) {
      return { ok: false, error: 'Ville requise.' };
    }
    if (params.type !== 'import_zones' && params.zoneIds.length === 0) {
      return { ok: false, error: 'Sélectionne au moins une zone.' };
    }
    const r = await createJob(params, user.id);
    if (!r.ok) return r;
    await logAdminAction('import_jobs.start', { type: params.type, jobId: r.id });
    revalidatePath('/dashboard/admin/ambassadeurs/terrain', 'page');
    return { ok: true, id: r.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

// ─── List active + recent jobs for the live progress panel ─────────────────

export async function listImportJobs(): Promise<Result<{ jobs: ImportJobView[] }>> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();
    // Active + last 20 completed/failed/cancelled. The UI hides finished ones
    // after a short idle window, but we still want them queryable for "I just
    // refreshed and want to see the result".
    const { data, error } = await service
      .from('import_jobs')
      .select('id, type, status, params, total, done, succeeded, failed_count, current_step, result, created_at, started_at, finished_at, last_heartbeat_at, error, worker_token')
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) return { ok: false, error: error.message };

    // Auto-resume: every poll, look for jobs whose chain has gone silent and
    // re-poke the worker. Catches the case where a chunk crashed mid-way, a
    // cold start ate the inter-chunk fetch, or the previous worker hit its
    // maxDuration before its `after()` could fire the next poke. The page
    // polling drives recovery — no cron needed.
    const now = Date.now();
    const STALE_RUNNING_MS = 60_000;   // chunks update heartbeat every few items
    const STALE_PENDING_MS = 45_000;   // initial poke should land in < 30s
    const toResume: Array<{ id: string; worker_token: string }> = [];
    for (const r of data ?? []) {
      if (r.status === 'running') {
        const hb = r.last_heartbeat_at ? new Date(r.last_heartbeat_at).getTime() : 0;
        if (now - hb > STALE_RUNNING_MS) toResume.push({ id: r.id, worker_token: r.worker_token });
      } else if (r.status === 'pending') {
        if (now - new Date(r.created_at).getTime() > STALE_PENDING_MS) {
          toResume.push({ id: r.id, worker_token: r.worker_token });
        }
      }
    }
    if (toResume.length > 0) {
      // Bump heartbeat first so a flurry of concurrent polls don't all poke at
      // once. Then fire pokes in parallel — pokeWorker swallows its own errors.
      const ids = toResume.map((j) => j.id);
      await service
        .from('import_jobs')
        .update({ last_heartbeat_at: new Date().toISOString() })
        .in('id', ids);
      await Promise.all(toResume.map((j) => pokeWorker(j.id, j.worker_token)));
    }

    const jobs: ImportJobView[] = (data ?? []).map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      params: r.params as unknown as ImportJobParams,
      total: r.total,
      done: r.done,
      succeeded: r.succeeded,
      failed: r.failed_count,
      currentStep: r.current_step,
      result: (r.result ?? {}) as Record<string, unknown>,
      createdAt: r.created_at,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      lastHeartbeatAt: r.last_heartbeat_at,
      error: r.error,
    }));
    return { ok: true, jobs };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

// ─── Cancel + retry ────────────────────────────────────────────────────────

export async function cancelImportJob(jobId: string): Promise<Result> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();
    // Only flip jobs that haven't already terminated — race-safe.
    const { error } = await service
      .from('import_jobs')
      .update({ status: 'cancelled', finished_at: new Date().toISOString() })
      .eq('id', jobId)
      .in('status', ['pending', 'running']);
    if (error) return { ok: false, error: error.message };
    await logAdminAction('import_jobs.cancel', { jobId });
    revalidatePath('/dashboard/admin/ambassadeurs/terrain', 'page');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

/**
 * Re-kick a stalled job: a worker chunk crashed or its poke didn't make it.
 * Flips status back to 'pending' so the worker starts a fresh chunk from the
 * cursor we left in `result`.
 */
export async function retryImportJob(jobId: string): Promise<Result> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();
    const { data: job } = await service
      .from('import_jobs')
      .select('id, worker_token, status')
      .eq('id', jobId)
      .maybeSingle();
    if (!job) return { ok: false, error: 'Job introuvable.' };
    if (job.status !== 'failed' && job.status !== 'cancelled' && job.status !== 'running') {
      return { ok: false, error: 'Job déjà terminé ou en attente.' };
    }
    await service.from('import_jobs').update({
      status: 'pending', error: null, finished_at: null,
    }).eq('id', jobId);
    await pokeWorker(jobId, job.worker_token);
    await logAdminAction('import_jobs.retry', { jobId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}
