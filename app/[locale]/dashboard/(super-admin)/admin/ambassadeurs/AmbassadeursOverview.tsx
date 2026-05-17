'use client';

import { useState, useTransition } from 'react';
import { markAmbassadorPayoutPaid, cancelAmbassadorPayout } from '@/actions/admin/ambassadors';

export interface AmbassadorOverviewRow {
  id: string;
  name: string;
  weekCount: number;
  monthCount: number;
  weeklyTier: { label: string; emoji: string; bonus: number } | null;
  earnedTotalCents: number;
  paidOrPendingCents: number;
  availableCents: number;
  hasStripeAccount: boolean;
  siret: string | null;
}

export interface PendingPayoutRow {
  id: string;
  ambassador_id: string;
  ambassador_name: string;
  amount_cents: number;
  status: string;
  requested_at: string;
}

const fmtEur = (cents: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

export function AmbassadeursOverview({
  rows,
  monthLeaderboard,
  pendingPayouts,
}: {
  rows: AmbassadorOverviewRow[];
  monthLeaderboard: Array<{ id: string; name: string; count: number }>;
  pendingPayouts: PendingPayoutRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingList, setPendingList] = useState(pendingPayouts);

  const handleMarkPaid = (id: string) => {
    setError(null);
    startTransition(async () => {
      const res = await markAmbassadorPayoutPaid(id);
      if (!res.ok) { setError(res.error); return; }
      setPendingList((prev) => prev.filter((p) => p.id !== id));
    });
  };

  const handleCancel = (id: string) => {
    const reason = prompt('Raison de l\'annulation (optionnel) :') ?? undefined;
    setError(null);
    startTransition(async () => {
      const res = await cancelAmbassadorPayout(id, reason);
      if (!res.ok) { setError(res.error); return; }
      setPendingList((prev) => prev.filter((p) => p.id !== id));
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 28 }}>
      {/* Monthly leaderboard */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            🏆 Classement du mois (100€ au #1)
          </h2>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            Mois civil — auto Lundi/1er
          </span>
        </div>
        {monthLeaderboard.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Aucune vente ce mois-ci.</div>
        ) : (
          <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {monthLeaderboard.map((entry, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
              return (
                <li key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: idx < monthLeaderboard.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <span style={{ fontSize: 13, fontWeight: idx === 0 ? 700 : 500, color: idx === 0 ? 'var(--warning)' : 'var(--text)' }}>
                    {medal} {entry.name}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{entry.count} vente{entry.count !== 1 ? 's' : ''}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Pending payouts */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 18 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>
          💸 Virements en attente
        </h2>
        {error && (
          <div style={{ fontSize: 12.5, color: 'var(--error)', padding: '8px 12px', background: 'var(--error-bg)', borderRadius: 8, marginBottom: 10 }}>
            {error}
          </div>
        )}
        {pendingList.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Aucune demande en attente.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Ambassadeur', 'Montant', 'Demandé le', 'Statut', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendingList.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{p.ambassador_name}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--accent)' }}>{fmtEur(p.amount_cents)}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-3)' }}>
                    {new Date(p.requested_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--warning-bg)', color: 'var(--warning)', fontWeight: 600 }}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleMarkPaid(p.id)}
                      disabled={isPending}
                      style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', background: 'var(--success)', color: '#fff', cursor: 'pointer' }}
                    >
                      Marquer payé
                    </button>
                    <button
                      onClick={() => handleCancel(p.id)}
                      disabled={isPending}
                      style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
                    >
                      Annuler
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Tiers overview — who is at what tier this week */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 18 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>
          🎯 Paliers de la semaine en cours
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Ambassadeur', 'Semaine', 'Mois', 'Palier hebdo', 'Solde dû', 'Déjà versé', 'Stripe'].map((h) => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: '8px 10px', fontWeight: 700 }}>{r.weekCount}</td>
                <td style={{ padding: '8px 10px' }}>{r.monthCount}</td>
                <td style={{ padding: '8px 10px' }}>
                  {r.weeklyTier ? (
                    <span style={{ fontSize: 12, fontWeight: 600 }}>
                      {r.weeklyTier.emoji} {r.weeklyTier.label} <span style={{ color: 'var(--success)' }}>+{fmtEur(r.weeklyTier.bonus)}</span>
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
                  )}
                </td>
                <td style={{ padding: '8px 10px', color: r.availableCents >= 3000 ? 'var(--success)' : 'var(--text-3)', fontWeight: 600 }}>
                  {fmtEur(r.availableCents)}
                </td>
                <td style={{ padding: '8px 10px', color: 'var(--text-3)' }}>{fmtEur(r.paidOrPendingCents)}</td>
                <td style={{ padding: '8px 10px' }}>
                  {r.hasStripeAccount ? (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--success-bg)', color: 'var(--success)', fontWeight: 600 }}>
                      ✓ {r.siret ? 'SIRET' : 'OK'}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--neutral-bg)', color: 'var(--neutral)' }}>
                      Non configuré
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
