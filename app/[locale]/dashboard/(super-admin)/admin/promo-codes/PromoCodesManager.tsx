'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPromoCode, togglePromoCode } from '@/actions/admin/promo-codes';

type PromoCode = {
  id: string;
  code: string;
  percentage_off: number;
  max_redemptions: number | null;
  times_redeemed: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

const input: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)', boxSizing: 'border-box',
};
const primaryBtn: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 'var(--radius-sm)',
  background: 'var(--accent)', border: '1px solid var(--accent)',
  color: 'var(--accent-contrast, #fff)', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--font)',
};
const secondaryBtn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--font)',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export function PromoCodesManager({ initialCodes }: { initialCodes: PromoCode[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [percentage, setPercentage] = useState(10);
  const [maxRedeem, setMaxRedeem] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  const handleCreate = () => {
    setError(null);
    startTransition(async () => {
      const res = await createPromoCode({
        code: code.trim().toUpperCase(),
        percentageOff: percentage,
        maxRedemptions: maxRedeem ? parseInt(maxRedeem, 10) : null,
        expiresAt: expiresAt || null,
      });
      if (!res.ok) {
        setError(res.error);
      } else {
        notify(`Code ${code.toUpperCase()} créé !`);
        setShowForm(false);
        setCode(''); setPercentage(10); setMaxRedeem(''); setExpiresAt('');
        router.refresh();
      }
    });
  };

  const handleToggle = (id: string, currentActive: boolean) => {
    startTransition(async () => {
      const res = await togglePromoCode(id, !currentActive);
      if (!res.ok) setError(res.error);
      else { notify(currentActive ? 'Code désactivé.' : 'Code activé.'); router.refresh(); }
    });
  };

  return (
    <div>
      {toast && (
        <div style={{ padding: 10, marginBottom: 14, borderRadius: 'var(--radius-sm)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: 12 }}>
          {toast}
        </div>
      )}
      {error && (
        <div style={{ padding: 10, marginBottom: 14, borderRadius: 'var(--radius-sm)', background: 'var(--error-bg)', color: 'var(--error)', fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={primaryBtn} onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Annuler' : '+ Créer un code promo'}
        </button>
      </div>

      {showForm && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 20, marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Nouveau code promo</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <label>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>Code (ex: SUMMER20)</div>
              <input
                type="text" style={input} value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="SUMMER20" maxLength={20}
              />
            </label>
            <label>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>Réduction (%)</div>
              <input
                type="number" style={input} value={percentage} min={1} max={100}
                onChange={e => setPercentage(Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              />
            </label>
            <label>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>Utilisations max (optionnel)</div>
              <input
                type="number" style={input} value={maxRedeem} min={1}
                onChange={e => setMaxRedeem(e.target.value)}
                placeholder="Illimité"
              />
            </label>
            <label>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>Expiration (optionnel)</div>
              <input type="date" style={input} value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
            </label>
          </div>
          <div style={{ marginTop: 14 }}>
            <button
              style={primaryBtn}
              disabled={pending || !code.trim() || percentage < 1}
              onClick={handleCreate}
            >
              {pending ? 'Création…' : `Créer "${code.toUpperCase() || '…'}" — ${percentage}% de remise`}
            </button>
          </div>
        </div>
      )}

      {initialCodes.length === 0 ? (
        <div style={{
          padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13,
          background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)',
        }}>
          Aucun code promo créé. Cliquez sur « Créer un code promo » pour commencer.
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Code', 'Remise', 'Utilisations', 'Max', 'Expiration', 'Statut', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initialCodes.map((p) => {
                const expired = isExpired(p.expires_at);
                const exhausted = p.max_redemptions !== null && p.times_redeemed >= p.max_redemptions;
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--text)' }}>
                      {p.code}
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--success)', fontWeight: 600 }}>
                      -{p.percentage_off}%
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                      {p.times_redeemed}
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-3)' }}>
                      {p.max_redemptions ?? '∞'}
                    </td>
                    <td style={{ padding: '11px 14px', color: expired ? 'var(--error)' : 'var(--text-3)' }}>
                      {p.expires_at ? formatDate(p.expires_at) : '—'}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {expired || exhausted ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 100, background: 'var(--error-bg)', color: 'var(--error)' }}>
                          {expired ? 'Expiré' : 'Épuisé'}
                        </span>
                      ) : p.is_active ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 100, background: 'var(--success-bg)', color: 'var(--success)' }}>
                          Actif
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 100, background: 'var(--neutral-bg)', color: 'var(--neutral)' }}>
                          Désactivé
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {!expired && !exhausted && (
                        <button
                          style={{
                            ...secondaryBtn,
                            color: p.is_active ? 'var(--error)' : 'var(--success)',
                            borderColor: p.is_active ? 'var(--error)' : 'var(--success)',
                          }}
                          disabled={pending}
                          onClick={() => handleToggle(p.id, p.is_active)}
                        >
                          {p.is_active ? 'Désactiver' : 'Activer'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
