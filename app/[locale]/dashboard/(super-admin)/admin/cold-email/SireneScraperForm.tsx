'use client';

import { useState } from 'react';
import { scrapeSireneProspects } from '@/actions/admin/cold-email';

const SUGGESTED_NAF = [
  { code: '4791B', label: 'Vente à distance catalogue spécialisé' },
  { code: '4791A', label: 'Vente à distance catalogue général' },
  { code: '7311Z', label: 'Agences de publicité' },
  { code: '7022Z', label: 'Conseil pour les affaires' },
  { code: '7320Z', label: 'Études de marché et sondages' },
  { code: '4799B', label: 'Vente hors magasin (porte-à-porte, MLM)' },
  { code: '7021Z', label: 'Relations publiques et communication' },
  { code: '8230Z', label: 'Salons professionnels et congrès' },
  { code: '7490B', label: 'Activités spécialisées diverses' },
];

const inp: React.CSSProperties = {
  padding: '8px 10px', background: 'var(--surface-2)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13,
  outline: 'none',
};
const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block',
};

export function SireneScraperForm() {
  const [selectedNaf, setSelectedNaf] = useState<Set<string>>(new Set(['4791B', '7022Z']));
  const [monthsBack, setMonthsBack] = useState(12);
  const [postalPrefix, setPostalPrefix] = useState('');
  const [maxPages, setMaxPages] = useState(2);
  const [youngOnly, setYoungOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; fetched: number; inserted: number; skippedYoung: number; skippedDuplicates: number; errors: string[] }
    | { ok: false; error: string }
    | null
  >(null);

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
    try {
      const r = await scrapeSireneProspects({
        nafCodes: [...selectedNaf],
        monthsBack,
        postalCodePrefix: postalPrefix.trim() || undefined,
        maxPages,
        youngOnly,
      });
      setResult(r);
    } finally {
      setBusy(false);
    }
  }

  const estimatedCalls = maxPages;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
        Scraper SIRENE INSEE (auto-entrepreneurs récents)
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.5 }}>
        Récupère depuis la base publique SIRENE les entreprises individuelles (catégorie 1000)
        créées récemment sur des NAF commerciaux. Les emails ne sont pas inclus (SIRENE ne les
        expose pas) — il faudra enrichir via Dropcontact/Hunter par SIRET avant que la séquence
        ne démarre. Requiert <code>INSEE_API_KEY</code> dans les env Vercel (gratuit, portail-api.insee.fr).
      </div>

      <div style={{ marginBottom: 16 }}>
        <span style={lbl}>Codes NAF cibles ({selectedNaf.size} sélectionné{selectedNaf.size > 1 ? 's' : ''})</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SUGGESTED_NAF.map(({ code, label }) => {
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        <div>
          <span style={lbl}>Créés il y a &lt;</span>
          <select value={monthsBack} onChange={e => setMonthsBack(Number(e.target.value))} style={inp}>
            <option value={3}>3 mois</option>
            <option value={6}>6 mois</option>
            <option value={12}>12 mois</option>
            <option value={24}>24 mois</option>
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

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', marginBottom: 16, cursor: 'pointer' }}>
        <input type="checkbox" checked={youngOnly} onChange={e => setYoungOnly(e.target.checked)} />
        <span>Garder uniquement les prospects estimés <strong>&lt; 25 ans</strong> (via prénom INSEE)</span>
      </label>

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
            ✓ {result.fetched} récupérés · <strong>{result.inserted} ajoutés</strong> · {result.skippedYoung} hors-cible âge · {result.skippedDuplicates} doublons
          </div>
        )}
        {result && !result.ok && (
          <div style={{ fontSize: 12, color: 'var(--error, #ef4444)' }}>✗ {result.error}</div>
        )}
      </div>

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
