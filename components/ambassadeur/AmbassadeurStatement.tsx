'use client';

import { useState, useEffect, useCallback } from 'react';

interface StatementEntry {
  id: string;
  kind: 'commission' | 'bonus' | 'referral' | 'payout';
  label: string;
  amountCents: number;
  date: string;
  status: 'credited' | 'pending' | 'paid' | 'failed' | null;
}

interface StatementData {
  available: number;
  entries: StatementEntry[];
}

function fmtSigned(cents: number): string {
  const sign = cents >= 0 ? '+' : '−';
  const eur = Math.abs(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign} ${eur} €`;
}

function fmtEur(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}

const KIND_ICON: Record<StatementEntry['kind'], string> = {
  commission: '🏷️',
  bonus: '🎁',
  referral: '🤝',
  payout: '🏦',
};

export function AmbassadeurStatement({ code }: { code: string }) {
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(() => {
    return fetch(`/api/ambassadeur/${encodeURIComponent(code)}/statement`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .catch(() => { /* keep last good data */ });
  }, [code]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = () => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  };

  if (!data) return null;

  const { available, entries } = data;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Relevé de compte
        </span>
        <button
          onClick={handleRefresh}
          disabled={loading}
          style={{ fontSize: 11, color: 'var(--text-3)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
        >
          {loading ? '…' : '↻ Actualiser'}
        </button>
      </div>

      {/* Balance summary */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Solde disponible</div>
        <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--success)' }}>
          {fmtEur(available)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
          Commissions de vente + bonus et primes validés par l&apos;équipe, moins les virements.
        </div>
      </div>

      {/* Ledger */}
      {entries.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          Aucun mouvement pour l&apos;instant.
        </div>
      ) : (
        entries.map((e, idx) => {
          const credit = e.amountCents >= 0;
          return (
            <div
              key={e.id}
              style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10,
                padding: '11px 16px', alignItems: 'center',
                borderBottom: idx < entries.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              <span style={{ fontSize: 15 }}>{KIND_ICON[e.kind]}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                  {fmtDate(e.date)}
                  {e.kind === 'payout' && e.status === 'pending' && ' · en cours'}
                  {e.kind === 'payout' && e.status === 'failed' && ' · échoué'}
                </div>
              </div>
              <div style={{
                fontSize: 13, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap',
                color: credit ? 'var(--success)' : 'var(--text-2)',
              }}>
                {fmtSigned(e.amountCents)}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
