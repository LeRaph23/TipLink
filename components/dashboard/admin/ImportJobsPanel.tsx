'use client';

// Live panel for the super-admin "Établissements & zones" page.
//
// Polls listImportJobs every 2s while any job is non-terminal (pending /
// running), and stops polling once everything has finished. Crucially, when
// the page re-opens the panel re-discovers in-flight jobs from the DB — the
// admin closing the tab doesn't lose visibility into what's still running.

import { useEffect, useState, useTransition, useCallback } from 'react';
import {
  listImportJobs,
  cancelImportJob,
  retryImportJob,
} from '@/actions/admin/import-jobs';
import type { ImportJobView, ImportJobType, ImportJobStatus } from '@/lib/admin/import-jobs';

const POLL_MS_ACTIVE = 2000;
const POLL_MS_IDLE   = 30000;
// Hide finished jobs from the panel once they've been done for this long
// (the admin saw the success/error, no point cluttering the list).
const KEEP_FINISHED_MS = 5 * 60 * 1000;

const TYPE_LABEL: Record<ImportJobType, string> = {
  import_zones:     'Import des zones',
  import_salons:    'Import des établissements',
  enrich_addresses: 'Enrichissement adresses',
  enrich_google:    'Enrichissement Google',
  full_import:      'Import complet',
  import_france:    'Import France',
};

const STATUS_LABEL: Record<ImportJobStatus, string> = {
  pending:   'En attente',
  running:   'En cours',
  completed: 'Terminé',
  failed:    'Échec',
  cancelled: 'Annulé',
};

export function ImportJobsPanel({ onAnyComplete }: { onAnyComplete?: () => void }) {
  const [jobs, setJobs] = useState<ImportJobView[]>([]);
  const [loading, setLoading] = useState(true);
  // `now` ticks with every poll so JobRow can derive "is this stalled?" purely
  // from props. Storing the timestamp in state keeps render pure (react-hooks/purity).
  const [now, setNow] = useState<number>(() => Date.now());
  const [, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const r = await listImportJobs();
    const tick = Date.now();
    if (r.ok) {
      // Drop jobs that finished more than KEEP_FINISHED_MS ago — they just
      // clutter the panel. They're still queryable in the DB.
      const visible = r.jobs.filter((j) => {
        if (j.status === 'pending' || j.status === 'running') return true;
        if (!j.finishedAt) return true;
        return tick - new Date(j.finishedAt).getTime() < KEEP_FINISHED_MS;
      });
      setJobs(visible);
    }
    setNow(tick);
    setLoading(false);
  }, []);

  // Adaptive polling: 2s while anything is moving, 30s otherwise. The first
  // refresh runs on next tick (setTimeout 0) so the effect body itself never
  // calls setState — keeps react-hooks/set-state-in-effect happy. Subsequent
  // refreshes happen inside the setInterval callback. Restarted whenever the
  // active-or-idle mix flips.
  const anyActive = jobs.some((j) => j.status === 'pending' || j.status === 'running');
  useEffect(() => {
    let cancelled = false;
    const tick = () => { if (!cancelled) refresh(); };
    const initial = setTimeout(tick, 0);
    const id = setInterval(tick, anyActive ? POLL_MS_ACTIVE : POLL_MS_IDLE);
    return () => { cancelled = true; clearTimeout(initial); clearInterval(id); };
  }, [refresh, anyActive]);

  // When the last active job flips terminal, ask the parent to refresh its
  // server-rendered counts (zones/salons may have grown).
  useEffect(() => {
    if (!anyActive && jobs.length > 0 && onAnyComplete) onAnyComplete();
  }, [anyActive, jobs.length, onAnyComplete]);

  const handleCancel = (id: string) => {
    startTransition(async () => { await cancelImportJob(id); refresh(); });
  };
  const handleRetry = (id: string) => {
    startTransition(async () => { await retryImportJob(id); refresh(); });
  };

  if (loading || jobs.length === 0) return null;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 12, marginBottom: 18,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10,
      }}>
        Jobs d&apos;import ({jobs.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {jobs.map((j) => (
          <JobRow
            key={j.id}
            job={j}
            now={now}
            onCancel={() => handleCancel(j.id)}
            onRetry={() => handleRetry(j.id)}
          />
        ))}
      </div>
    </div>
  );
}

function JobRow({ job, now, onCancel, onRetry }: {
  job: ImportJobView; now: number; onCancel: () => void; onRetry: () => void;
}) {
  const isActive   = job.status === 'pending' || job.status === 'running';
  // A 'running' job is stalled when its heartbeat is silent for >2 min — the
  // chunk crashed or pokeWorker dropped on the floor. A 'pending' job is
  // stalled if it never moved past pending for >2 min (initial poke failed).
  // `now` is a tick passed by the parent so render stays pure.
  const isStalled  =
    (job.status === 'running' && isStaleHeartbeat(job.lastHeartbeatAt, now)) ||
    (job.status === 'pending' && now - new Date(job.createdAt).getTime() > 120_000);
  const pct = job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : null;

  const summary = describeJobParams(job);
  const result  = describeJobResult(job);

  const palette = statusPalette(job.status, isStalled);

  return (
    <div style={{
      background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)',
      border: `1px solid ${palette.border}`, padding: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
          padding: '2px 7px', borderRadius: 99,
          background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}`,
        }}>
          {isStalled ? 'Stalled' : STATUS_LABEL[job.status]}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          {TYPE_LABEL[job.type]}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{summary}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {isActive && (
            <button onClick={onCancel} style={smallBtnStyle}>Annuler</button>
          )}
          {(job.status === 'failed' || isStalled) && (
            <button onClick={onRetry} style={smallBtnPrimaryStyle}>Relancer</button>
          )}
        </div>
      </div>

      {(isActive || job.currentStep) && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.4 }}>
          {job.currentStep ?? '…'}
        </div>
      )}

      {pct != null && isActive && (
        <div style={{ marginTop: 6, height: 6, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: palette.bar, borderRadius: 99,
            transition: 'width 0.3s ease',
          }} />
        </div>
      )}

      {result && (
        <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 6 }}>
          {result}
        </div>
      )}

      {job.error && (
        <div style={{
          fontSize: 11, color: 'var(--error)', marginTop: 6,
          background: 'var(--error-bg)', borderRadius: 'var(--radius-sm)', padding: '4px 8px',
        }}>
          ⚠ {job.error}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isStaleHeartbeat(iso: string | null, now: number): boolean {
  if (!iso) return false;
  return now - new Date(iso).getTime() > 120_000; // 2 min without progress
}

function describeJobParams(job: ImportJobView): string {
  const p = job.params;
  if (p.type === 'import_zones') return `Ville : ${p.city}`;
  if (p.type === 'import_france') {
    return `${p.regions.length} région${p.regions.length > 1 ? 's' : ''}` +
      (p.enrich ? ' · enrichissement BAN' : '');
  }
  return `${p.zoneIds.length} zone${p.zoneIds.length > 1 ? 's' : ''}` +
    ('force' in p && p.force ? ' · re-traitement forcé' : '');
}

function describeJobResult(job: ImportJobView): string | null {
  const r = job.result;
  const bits: string[] = [];
  if (typeof r.inserted === 'number') bits.push(`${r.inserted} importés`);
  if (typeof r.skipped === 'number' && (r.skipped as number) > 0) bits.push(`${r.skipped} ignorés`);
  if (typeof r.enriched === 'number') bits.push(`${r.enriched} adresses ajoutées`);
  if (typeof r.matched === 'number') bits.push(`${r.matched} matchés sur Google`);
  if (typeof r.closed === 'number' && (r.closed as number) > 0) bits.push(`${r.closed} fermés`);
  if (typeof r.missing === 'number' && (r.missing as number) > 0) bits.push(`${r.missing} introuvables`);
  return bits.length === 0 ? null : bits.join(' · ');
}

function statusPalette(status: ImportJobStatus, stalled: boolean) {
  if (stalled) return { bg: 'var(--warning-bg)', fg: 'var(--warning)', border: 'var(--warning)', bar: 'var(--warning)' };
  switch (status) {
    case 'completed': return { bg: 'var(--success-bg)', fg: 'var(--success)', border: 'var(--success)', bar: 'var(--success)' };
    case 'failed':    return { bg: 'var(--error-bg)',   fg: 'var(--error)',   border: 'var(--error)',   bar: 'var(--error)' };
    case 'cancelled': return { bg: 'var(--surface-3)',  fg: 'var(--text-3)',  border: 'var(--border)',  bar: 'var(--text-3)' };
    case 'pending':   return { bg: 'var(--surface-3)',  fg: 'var(--text-2)',  border: 'var(--border)',  bar: 'var(--accent)' };
    case 'running':   return { bg: 'var(--accent-muted)', fg: 'var(--accent)', border: 'var(--accent-border)', bar: 'var(--accent)' };
  }
}

const smallBtnStyle: React.CSSProperties = {
  padding: '4px 10px', fontSize: 11, fontWeight: 600,
  background: 'var(--surface)', color: 'var(--text-2)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
};
const smallBtnPrimaryStyle: React.CSSProperties = {
  ...smallBtnStyle, background: 'var(--accent)', color: '#fff', border: 'none',
};
