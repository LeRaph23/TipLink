'use client';

import { useState } from 'react';
import { importColdEmailProspects } from '@/actions/admin/cold-email';

export function ColdEmailImporter() {
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; inserted: number; skipped: number; errors: string[] }
    | { ok: false; error: string }
    | null
  >(null);

  async function handleImport() {
    setBusy(true);
    setResult(null);
    try {
      const r = await importColdEmailProspects(csv);
      setResult(r);
      if (r.ok) setCsv('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
        Importer un CSV
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
        Colonnes attendues (en-tête obligatoire) : <code>siret,company_name,email,first_name,city,naf_code,creation_date</code>.
        Une seule colonne <code>siret</code> suffit, les autres sont optionnelles. Dédupliqué automatiquement par SIRET.
      </div>
      <textarea
        value={csv}
        onChange={e => setCsv(e.target.value)}
        rows={12}
        placeholder="siret,company_name,email,first_name,city,naf_code,creation_date&#10;12345678901234,Boutique Lucas,lucas@example.com,Lucas,Lyon,4791B,2024-06-15"
        style={{
          width: '100%', padding: 12, fontFamily: 'monospace', fontSize: 12,
          background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', resize: 'vertical', outline: 'none',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <button
          onClick={handleImport}
          disabled={busy || !csv.trim()}
          style={{
            padding: '10px 16px', background: 'var(--accent, #22c55e)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700,
            cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Import en cours…' : 'Importer'}
        </button>
        {result && result.ok && (
          <div style={{ fontSize: 12, color: 'var(--success, #22c55e)' }}>
            ✓ {result.inserted} ajoutés · {result.skipped} ignorés
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
