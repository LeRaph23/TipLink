'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, SectionHeader, Button, Stat, EmptyState, FONT, WEIGHT } from './ui';
import { Icon, type IconName } from './icons';

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
  return `${sign} ${eur} €`;
}

function fmtEur(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}

const KIND_ICON: Record<StatementEntry['kind'], IconName> = {
  commission: 'tag',
  bonus: 'gift',
  referral: 'users',
  payout: 'bank',
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
    <Card padded={false}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <SectionHeader
          title="Relevé de compte"
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              loading={loading}
              iconLeft={<Icon name="refresh" size={13} />}
            >
              Actualiser
            </Button>
          }
        />
      </div>

      {/* Balance summary */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
        <Stat
          label="Solde disponible"
          value={fmtEur(available)}
          tone="success"
          sub="Commissions de vente + bonus et primes validés par l'équipe, moins les virements."
        />
      </div>

      {/* Ledger */}
      {entries.length === 0 ? (
        <EmptyState>Aucun mouvement pour l&apos;instant.</EmptyState>
      ) : (
        entries.map((e, idx) => {
          const credit = e.amountCents >= 0;
          return (
            <div
              key={e.id}
              style={{
                display: 'flex', gap: 10,
                padding: '11px 16px', alignItems: 'center',
                borderBottom: idx < entries.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-2)', color: 'var(--text-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon name={KIND_ICON[e.kind]} size={15} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: FONT.body, fontWeight: WEIGHT.medium, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.label}
                </div>
                <div style={{ fontSize: FONT.label, color: 'var(--text-3)', marginTop: 1 }}>
                  {fmtDate(e.date)}
                  {e.kind === 'payout' && e.status === 'pending' && ' · en cours'}
                  {e.kind === 'payout' && e.status === 'failed' && ' · échoué'}
                </div>
              </div>
              <div style={{
                fontSize: FONT.body, fontWeight: WEIGHT.bold, textAlign: 'right', whiteSpace: 'nowrap',
                color: credit ? 'var(--success)' : 'var(--text-2)',
              }}>
                {fmtSigned(e.amountCents)}
              </div>
            </div>
          );
        })
      )}
    </Card>
  );
}
