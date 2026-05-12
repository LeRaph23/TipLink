'use client';

import { useState } from 'react';
import { enrichProspectEmails } from '@/actions/admin/cold-email';

export function EmailEnrichmentImporter() {
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; updated: number; notFound: number; errors: string[] }
    | { ok: false; error: string }
    | null
  >(null);

  async function handleEnrich() {
    setBusy(true);
    setResult(null);
    try {
      const r = await enrichProspectEmails(csv);
      setResult(r);
      if (r.ok && r.updated > 0) setCsv('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
        Enrichir des prospects avec leurs emails
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
        Une fois les SIRET scrapés depuis SIRENE, exporte-les vers Dropcontact / Hunter /
        Pharow / Kaspr pour récupérer les emails. Re-importe ensuite le résultat ici au format
        <code> siret,email</code> (une ligne par contact). Met à jour uniquement les prospects
        qui n&apos;ont pas encore d&apos;email — la séquence cold-email démarre automatiquement
        au prochain cron.
      </div>
      <textarea
        value={csv}
        onChange={e => setCsv(e.target.value)}
        rows={8}
        placeholder="siret,email&#10;12345678901234,lucas@example.com&#10;98765432109876,marie@example.com"
        style={{
          width: '100%', padding: 12, fontFamily: 'monospace', fontSize: 12,
          background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', resize: 'vertical', outline: 'none',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <button
          onClick={handleEnrich}
          disabled={busy || !csv.trim()}
          style={{
            padding: '10px 16px', background: 'var(--accent, #22c55e)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700,
            cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Enrichissement…' : 'Enrichir les emails'}
        </button>
        {result && result.ok && (
          <div style={{ fontSize: 12, color: 'var(--success, #22c55e)' }}>
            ✓ {result.updated} prospects enrichis · {result.notFound} SIRET non trouvés en base
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
