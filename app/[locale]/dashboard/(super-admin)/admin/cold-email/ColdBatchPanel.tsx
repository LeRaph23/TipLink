'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  triggerColdEmailBatch,
  enrichProspectsBatch,
  type ColdEmailProgramStats,
} from '@/actions/admin/cold-email';
import type { ColdTargetProgram } from '@/lib/cold-email/programs';

type TallyByProgram = Record<ColdTargetProgram, {
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
} | null>;

const PROGRAM_META: Record<ColdTargetProgram, { label: string; tag: string; color: string; bg: string; border: string }> = {
  ambassador: {
    label: 'Ambassadeurs',
    tag: 'Resend · ambassadeur@digitip.app',
    color: '#15803d',
    bg: '#dcfce7',
    border: '#86efac',
  },
  commercial: {
    label: 'Commerciaux Pros',
    tag: 'Brevo · raphael@partenaires.digitip.app',
    color: '#a16207',
    bg: '#fef3c7',
    border: '#fcd34d',
  },
};

export function ColdBatchPanel({
  ambassadorStats,
  commercialStats,
}: {
  ambassadorStats: ColdEmailProgramStats | null;
  commercialStats: ColdEmailProgramStats | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tallies, setTallies] = useState<TallyByProgram>({ ambassador: null, commercial: null });
  const [err, setErr] = useState<string | null>(null);
  const [activeProgram, setActiveProgram] = useState<ColdTargetProgram | null>(null);
  const [enrichingProgram, setEnrichingProgram] = useState<ColdTargetProgram | null>(null);
  const [enrichProgress, setEnrichProgress] = useState<{ processed: number; withEmail: number; withWebsite: number; remaining: number } | null>(null);

  function send(program: ColdTargetProgram) {
    setErr(null);
    setActiveProgram(program);
    startTransition(async () => {
      const r = await triggerColdEmailBatch({ targetProgram: program, limit: 20 });
      setActiveProgram(null);
      if (!r.ok) { setErr(r.error); return; }
      const next: TallyByProgram = { ...tallies };
      for (const t of r.tallies) next[t.program] = { considered: t.considered, sent: t.sent, skipped: t.skipped, failed: t.failed };
      setTallies(next);
    });
  }

  async function enrich(program: ColdTargetProgram) {
    setErr(null);
    setEnrichingProgram(program);
    setEnrichProgress({ processed: 0, withEmail: 0, withWebsite: 0, remaining: 0 });
    let processed = 0;
    let withEmail = 0;
    let withWebsite = 0;
    for (let i = 0; i < 40; i++) {
      const r = await enrichProspectsBatch({ targetProgram: program, limit: 25 });
      if (!r.ok) { setErr(r.error); break; }
      processed += r.result.considered;
      withEmail += r.result.withEmail;
      withWebsite += r.result.withWebsite;
      setEnrichProgress({ processed, withEmail, withWebsite, remaining: r.result.remaining });
      router.refresh();
      if (r.result.considered === 0 || r.result.remaining === 0) break;
    }
    setEnrichingProgram(null);
  }

  return (
    <section style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 20, marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
        Vagues d&apos;envoi
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.5 }}>
        Cron automatique : mardi / mercredi / jeudi à 9h (50 mails max par programme et par jour, suite + relances).
        Bouton manuel : déclenche immédiatement une vague de 20 mails sur le programme choisi.
      </div>

      {err && (
        <div style={{ padding: 8, marginBottom: 12, background: '#fee2e2', color: '#b91c1c', borderRadius: 6, fontSize: 12.5 }}>
          {err}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {(['ambassador', 'commercial'] as const).map((program) => {
          const meta = PROGRAM_META[program];
          const stats = program === 'ambassador' ? ambassadorStats : commercialStats;
          const tally = tallies[program];
          const sending = isPending && activeProgram === program;

          return (
            <div
              key={program}
              style={{
                background: meta.bg,
                border: `1px solid ${meta.border}`,
                borderRadius: 'var(--radius-sm)',
                padding: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: meta.color, opacity: 0.7 }}>{meta.tag}</span>
              </div>

              {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 12 }}>
                  <Stat label="Total"     v={stats.total} />
                  <Stat label="Étape 0"   v={stats.step0} highlight={stats.step0 > 0} />
                  <Stat label="En cours"  v={stats.step1 + stats.step2} />
                  <Stat label="Terminés"  v={stats.step3} />
                  <Stat label="Désins."   v={stats.unsubscribed} />
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  onClick={() => send(program)}
                  disabled={isPending || enrichingProgram !== null}
                  style={{
                    width: '100%', padding: '8px 14px', borderRadius: 6, border: 'none',
                    background: meta.color, color: '#fff',
                    fontSize: 12.5, fontWeight: 700, cursor: (isPending || enrichingProgram !== null) ? 'wait' : 'pointer',
                    opacity: (isPending || enrichingProgram !== null) ? 0.7 : 1,
                  }}
                >
                  {sending ? 'Envoi en cours…' : `Envoyer une vague (20) →`}
                </button>
                <button
                  onClick={() => enrich(program)}
                  disabled={enrichingProgram !== null || isPending}
                  style={{
                    width: '100%', padding: '6px 12px', borderRadius: 6,
                    border: `1px solid ${meta.color}`,
                    background: 'transparent', color: meta.color,
                    fontSize: 11.5, fontWeight: 600,
                    cursor: (enrichingProgram || isPending) ? 'wait' : 'pointer',
                    opacity: (enrichingProgram || isPending) ? 0.7 : 1,
                  }}
                >
                  {enrichingProgram === program
                    ? `Enrichissement… ${enrichProgress?.processed ?? 0} traités`
                    : 'Enrichir auto. (site + email)'}
                </button>
              </div>

              {tally && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: meta.color, lineHeight: 1.45 }}>
                  ✓ {tally.sent} envoyé{tally.sent !== 1 ? 's' : ''} · {tally.skipped} ignoré{tally.skipped !== 1 ? 's' : ''} · {tally.failed} échec{tally.failed !== 1 ? 's' : ''} · {tally.considered} considérés
                </div>
              )}
              {enrichingProgram === program && enrichProgress && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: meta.color, lineHeight: 1.45 }}>
                  {enrichProgress.withEmail} emails · {enrichProgress.withWebsite} sites · {enrichProgress.remaining} restants
                </div>
              )}
              {enrichingProgram === null && enrichProgress && enrichProgress.processed > 0 && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: meta.color, lineHeight: 1.45 }}>
                  ✓ Enrichissement terminé · {enrichProgress.processed} prospects · {enrichProgress.withEmail} emails · {enrichProgress.withWebsite} sites
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Stat({ label, v, highlight }: { label: string; v: number; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: highlight ? 'var(--accent)' : 'var(--text)', letterSpacing: '-0.02em' }}>{v}</div>
    </div>
  );
}
