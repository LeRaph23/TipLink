'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { scrapeSireneProspects, enrichProspectsBatch } from '@/actions/admin/cold-email';
import {
  AMBASSADOR_NAF,
  COMMERCIAL_NAF_BY_VERTICAL,
  COMMERCIAL_VERTICAL_LABEL,
  DEFAULT_NAF_SELECTION,
  SIZE_BUCKET_VALUES,
  type ColdTargetProgram,
  type CommercialVertical,
  type SizeBucket,
} from '@/lib/cold-email/programs';

const inp: React.CSSProperties = {
  padding: '8px 10px', background: 'var(--surface-2)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13,
  outline: 'none',
};
const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block',
};

const PROGRAM_LABEL: Record<ColdTargetProgram, { name: string; tag: string }> = {
  ambassador: { name: 'Ambassadeurs', tag: 'Resend · ambassadeur@digitip.app' },
  commercial: { name: 'Commerciaux Pros', tag: 'Brevo · raphael@partenaires.digitip.app' },
};

const SIZE_OPTIONS: { value: SizeBucket; label: string; sub: string }[] = [
  { value: 'indé', label: 'À leur compte',  sub: '≤ 5 salariés · indé / TPE solo' },
  { value: 'tpe',  label: 'Petite TPE',     sub: '≤ 20 salariés' },
  { value: 'all',  label: 'Toutes tailles', sub: 'inclut PME / ETI / grands groupes' },
];

export function SireneScraperForm() {
  const router = useRouter();
  const [program, setProgram] = useState<ColdTargetProgram>('commercial');
  const [vertical, setVertical] = useState<CommercialVertical>('restauration');
  const [size, setSize] = useState<SizeBucket>('indé');
  const [selectedNaf, setSelectedNaf] = useState<Set<string>>(
    new Set(DEFAULT_NAF_SELECTION.commercial.restauration),
  );
  const [monthsBack, setMonthsBack] = useState(24);
  const [postalPrefix, setPostalPrefix] = useState('');
  const [maxPages, setMaxPages] = useState(2);
  const [youngOnly, setYoungOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; fetched: number; inserted: number; skippedYoung: number; skippedEmpty: number; skippedDuplicates: number; errors: string[] }
    | { ok: false; error: string }
    | null
  >(null);
  const [enrichStatus, setEnrichStatus] = useState<
    | { phase: 'idle' }
    | { phase: 'running'; processed: number; withEmail: number; withWebsite: number; remaining: number }
    | { phase: 'done'; processed: number; withEmail: number; withWebsite: number }
    | { phase: 'error'; error: string }
  >({ phase: 'idle' });

  const presets = useMemo(() => {
    if (program === 'ambassador') return AMBASSADOR_NAF;
    return COMMERCIAL_NAF_BY_VERTICAL[vertical];
  }, [program, vertical]);

  function switchProgram(next: ColdTargetProgram) {
    setProgram(next);
    if (next === 'commercial') {
      setSelectedNaf(new Set(DEFAULT_NAF_SELECTION.commercial[vertical]));
      setSize('indé');
      setYoungOnly(false);
    } else {
      setSelectedNaf(new Set(DEFAULT_NAF_SELECTION.ambassador));
      setSize('all');
      setYoungOnly(true);
    }
    setResult(null);
  }

  function switchVertical(next: CommercialVertical) {
    setVertical(next);
    setSelectedNaf(new Set(DEFAULT_NAF_SELECTION.commercial[next]));
    setResult(null);
  }

  function toggleNaf(code: string) {
    setSelectedNaf(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function handleScrape() {
    if (selectedNaf.size === 0) { setResult({ ok: false, error: 'Sélectionne au moins 1 code NAF.' }); return; }
    setBusy(true);
    setResult(null);
    setEnrichStatus({ phase: 'idle' });
    try {
      const r = await scrapeSireneProspects({
        nafCodes: [...selectedNaf],
        monthsBack,
        postalCodePrefix: postalPrefix.trim() || undefined,
        maxPages,
        youngOnly,
        targetProgram: program,
        trancheEffectifs: size === 'all' ? undefined : SIZE_BUCKET_VALUES[size],
      });
      setResult(r);
      router.refresh();
      if (r.ok && r.inserted > 0) {
        await runEnrichmentLoop(program);
      }
    } finally {
      setBusy(false);
    }
  }

  async function runEnrichmentLoop(targetProgram: ColdTargetProgram) {
    let processed = 0;
    let withEmail = 0;
    let withWebsite = 0;
    setEnrichStatus({ phase: 'running', processed, withEmail, withWebsite, remaining: 0 });
    for (let i = 0; i < 40; i++) {
      const r = await enrichProspectsBatch({ targetProgram, limit: 25 });
      if (!r.ok) {
        setEnrichStatus({ phase: 'error', error: r.error });
        return;
      }
      processed += r.result.considered;
      withEmail += r.result.withEmail;
      withWebsite += r.result.withWebsite;
      setEnrichStatus({
        phase: 'running',
        processed,
        withEmail,
        withWebsite,
        remaining: r.result.remaining,
      });
      router.refresh();
      if (r.result.considered === 0 || r.result.remaining === 0) break;
    }
    setEnrichStatus({ phase: 'done', processed, withEmail, withWebsite });
  }

  const estimatedCalls = maxPages;
  const programMeta = PROGRAM_LABEL[program];
  const sizeMeta = SIZE_OPTIONS.find((o) => o.value === size)!;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
        Scraper SIRENE INSEE
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.5 }}>
        Récupère depuis la base publique SIRENE des entreprises en lien avec ta cible.
        Les emails et sites web ne sont pas dans SIRENE — ils sont enrichis automatiquement
        après le scrape (api.gouv.fr Recherche d&apos;entreprises + scrape des pages contact).
        Requiert <code>INSEE_API_KEY</code> dans Vercel.
      </div>

      {/* Programme cible */}
      <div style={{ marginBottom: 14 }}>
        <span style={lbl}>Programme cible</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['ambassador', 'commercial'] as const).map((p) => {
            const active = program === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => switchProgram(p)}
                style={{
                  padding: '8px 14px',
                  background: active ? 'var(--accent)' : 'var(--surface-2)',
                  color: active ? '#fff' : 'var(--text-2)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 99,
                  fontSize: 12.5,
                  fontWeight: active ? 700 : 600,
                  cursor: 'pointer',
                }}
              >
                {PROGRAM_LABEL[p].name}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, fontFamily: 'var(--font-mono, monospace)' }}>
          Envoi : {programMeta.tag}
        </div>
      </div>

      {/* Vertical (commercial only) */}
      {program === 'commercial' && (
        <div style={{ marginBottom: 14 }}>
          <span style={lbl}>Vertical cible</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['restauration', 'beaute', 'general'] as const).map((v) => {
              const active = vertical === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => switchVertical(v)}
                  style={{
                    padding: '6px 12px',
                    background: active ? 'var(--text)' : 'var(--surface-2)',
                    color: active ? 'var(--bg)' : 'var(--text-2)',
                    border: `1px solid ${active ? 'var(--text)' : 'var(--border)'}`,
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {COMMERCIAL_VERTICAL_LABEL[v]}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.4 }}>
            {vertical === 'restauration' && 'Cible des distributeurs alimentaires & boissons indé qui démarchent déjà les CHR.'}
            {vertical === 'beaute' && 'Cible des grossistes parfumerie / produits de beauté qui démarchent déjà les salons & instituts.'}
            {vertical === 'general' && 'Cible des apporteurs d\'affaires généralistes & agents commerciaux.'}
          </div>
        </div>
      )}

      {/* NAF codes */}
      <div style={{ marginBottom: 14 }}>
        <span style={lbl}>Codes APE ({selectedNaf.size} sélectionné{selectedNaf.size > 1 ? 's' : ''})</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {presets.map(({ code, label }) => {
            const active = selectedNaf.has(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggleNaf(code)}
                title={label}
                style={{
                  padding: '6px 10px',
                  background: active ? 'var(--success, #22c55e)' : 'var(--surface-2)',
                  color: active ? '#fff' : 'var(--text-2)',
                  border: `1px solid ${active ? 'var(--success, #22c55e)' : 'var(--border)'}`,
                  borderRadius: 99,
                  fontSize: 11.5,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  fontWeight: active ? 700 : 500,
                }}
              >
                {code}
              </button>
            );
          })}
        </div>
      </div>

      {/* Size filter (commercial only) */}
      {program === 'commercial' && (
        <div style={{ marginBottom: 14 }}>
          <span style={lbl}>Taille d&apos;entreprise</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SIZE_OPTIONS.map((o) => {
              const active = size === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSize(o.value)}
                  title={o.sub}
                  style={{
                    padding: '6px 12px',
                    background: active ? 'var(--accent-muted)' : 'var(--surface-2)',
                    color: active ? 'var(--accent)' : 'var(--text-2)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
            {sizeMeta.sub} (filtre SIRENE sur trancheEffectifsUniteLegale)
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        <div>
          <span style={lbl}>Créés il y a &lt;</span>
          <select value={monthsBack} onChange={e => setMonthsBack(Number(e.target.value))} style={inp}>
            <option value={3}>3 mois</option>
            <option value={6}>6 mois</option>
            <option value={12}>12 mois</option>
            <option value={24}>24 mois</option>
            <option value={36}>36 mois</option>
          </select>
        </div>
        <div>
          <span style={lbl}>Dép. (préfixe CP)</span>
          <input
            value={postalPrefix}
            onChange={e => setPostalPrefix(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="ex: 69 (Lyon)"
            style={inp}
          />
        </div>
        <div>
          <span style={lbl}>Pages (×100 résultats)</span>
          <select value={maxPages} onChange={e => setMaxPages(Number(e.target.value))} style={inp}>
            <option value={1}>1 (~100)</option>
            <option value={2}>2 (~200)</option>
            <option value={5}>5 (~500)</option>
            <option value={10}>10 (~1000)</option>
            <option value={20}>20 (~2000)</option>
          </select>
        </div>
      </div>

      {program === 'ambassador' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={youngOnly} onChange={e => setYoungOnly(e.target.checked)} />
          <span>Garder uniquement les prospects estimés <strong>&lt; 25 ans</strong> (via prénom INSEE)</span>
        </label>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleScrape}
          disabled={busy || selectedNaf.size === 0}
          style={{
            padding: '10px 16px', background: 'var(--accent, #22c55e)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700,
            cursor: busy ? 'not-allowed' : 'pointer', opacity: busy || selectedNaf.size === 0 ? 0.5 : 1,
          }}
        >
          {busy ? `Scraping en cours (jusqu'à ${estimatedCalls}×100)...` : `Lancer le scrape SIRENE`}
        </button>

        {result && result.ok && (
          <div style={{ fontSize: 12, color: 'var(--success, #22c55e)' }}>
            ✓ {result.fetched} récupérés · <strong>{result.inserted} ajoutés</strong>
            {result.skippedEmpty > 0 && ` · ${result.skippedEmpty} sans nom`}
            {result.skippedYoung > 0 && ` · ${result.skippedYoung} hors-cible âge`}
            {result.skippedDuplicates > 0 && ` · ${result.skippedDuplicates} doublons`}
          </div>
        )}
        {result && !result.ok && (
          <div style={{ fontSize: 12, color: 'var(--error, #ef4444)' }}>✗ {result.error}</div>
        )}
      </div>

      {enrichStatus.phase !== 'idle' && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 'var(--radius-sm)',
          background: enrichStatus.phase === 'error' ? 'var(--error-bg, #fee2e2)' : 'var(--surface-2)',
          fontSize: 12, color: 'var(--text-2)',
        }}>
          {enrichStatus.phase === 'running' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 12, height: 12, borderRadius: '50%',
                border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
                animation: 'spin 0.7s linear infinite',
              }} />
              Enrichissement automatique en cours… {enrichStatus.processed} traités · <strong style={{ color: 'var(--success)' }}>{enrichStatus.withEmail} emails</strong> · <strong style={{ color: 'var(--accent)' }}>{enrichStatus.withWebsite} sites</strong> · {enrichStatus.remaining} restants
            </div>
          )}
          {enrichStatus.phase === 'done' && (
            <div style={{ color: 'var(--success)' }}>
              ✓ Enrichissement terminé · {enrichStatus.processed} traités · <strong>{enrichStatus.withEmail} emails trouvés</strong> · <strong>{enrichStatus.withWebsite} sites trouvés</strong>
            </div>
          )}
          {enrichStatus.phase === 'error' && (
            <div style={{ color: 'var(--error)' }}>
              ✗ Erreur enrichissement : {enrichStatus.error}
            </div>
          )}
        </div>
      )}

      {result && result.ok && result.errors.length > 0 && (
        <div style={{ marginTop: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--text-3)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Premiers warnings :</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {result.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
