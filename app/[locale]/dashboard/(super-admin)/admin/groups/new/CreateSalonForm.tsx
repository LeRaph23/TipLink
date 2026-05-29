'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { createSalon } from '@/actions/group';
import { Icon } from '@/components/ambassadeur/icons';

const COUNTRIES = [
  { code: 'FR', label: 'France' },
  { code: 'BE', label: 'Belgique' },
  { code: 'CH', label: 'Suisse' },
  { code: 'GB', label: 'Royaume-Uni' },
  { code: 'DE', label: 'Allemagne' },
  { code: 'ES', label: 'Espagne' },
  { code: 'IT', label: 'Italie' },
  { code: 'NL', label: 'Pays-Bas' },
];

const CURRENCIES: Record<string, string> = {
  FR: 'eur', BE: 'eur', DE: 'eur', ES: 'eur', IT: 'eur', NL: 'eur',
  CH: 'chf', GB: 'gbp',
};

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)',
  boxSizing: 'border-box',
};

export function CreateSalonForm({ baseUrl }: { baseUrl: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [country, setCountry] = useState('FR');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ establishmentId: string } | null>(null);

  function handleCountryChange(c: string) {
    setCountry(c);
  }

  function handleSubmit() {
    setError(null);
    const currency = CURRENCIES[country] ?? 'eur';
    startTransition(async () => {
      const res = await createSalon({ name: name.trim(), country, currency });
      if ('error' in res) { setError(res.error); return; }
      setResult({ establishmentId: res.establishmentId });
    });
  }

  if (result) {
    const joinUrl = `${baseUrl}/join/${result.establishmentId}`;
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 24 }}>
        <div style={{ marginBottom: 8, color: 'var(--success)' }}><Icon name="checkCircle" size={28} /></div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Salon créé</h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 18 }}>
          Partagez ce lien avec le manager ou les coiffeurs pour qu&apos;ils puissent rejoindre :
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
          <code style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', wordBreak: 'break-all' }}>
            {joinUrl}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(joinUrl)}
            style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font)' }}
          >
            Copier
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => { setResult(null); setName(''); setCountry('FR'); }}
            style={{ padding: '9px 16px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
          >
            Nouveau salon
          </button>
          <button
            type="button"
            onClick={() => router.push('/dashboard/admin/groups')}
            style={{ padding: '9px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
          >
            Retour à la liste →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 24, maxWidth: 480 }}>
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--error-bg)', color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <label style={{ display: 'block', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, fontWeight: 500 }}>Nom du salon</div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Salon de Marie"
          style={inp}
          autoFocus
        />
      </label>

      <label style={{ display: 'block', marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, fontWeight: 500 }}>Pays</div>
        <select value={country} onChange={(e) => handleCountryChange(e.target.value)} style={inp}>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => router.push('/dashboard/admin/groups')}
          style={{ padding: '10px 16px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)' }}
        >
          ← Annuler
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim() || pending}
          style={{ flex: 1, padding: '10px 16px', borderRadius: 8, background: !name.trim() || pending ? 'var(--surface-2)' : 'var(--accent)', color: !name.trim() || pending ? 'var(--text-3)' : '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: !name.trim() || pending ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)' }}
        >
          {pending ? 'Création…' : 'Créer le salon'}
        </button>
      </div>
    </div>
  );
}
