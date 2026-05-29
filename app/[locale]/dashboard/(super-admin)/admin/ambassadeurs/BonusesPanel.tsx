'use client';

import { useState, useTransition } from 'react';
import { creditBonus } from '@/actions/admin/ambassadors';
import { Icon } from '@/components/ambassadeur/icons';

export interface BonusReviewRow {
  key: string;
  ambassadorId: string;
  ambassadorName: string;
  kind: 'weekly_tier' | 'monthly_challenge';
  periodKey: string;
  label: string;
  detail: string;
  amountCents: number;
  credited: boolean;
}

const fmtEur = (cents: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em',
  borderBottom: '1px solid var(--border)',
};

export function BonusesPanel({ rows }: { rows: BonusReviewRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [bonusRows, setBonusRows] = useState(rows);

  const handleCredit = (row: BonusReviewRow) => {
    setError(null);
    startTransition(async () => {
      const res = await creditBonus(row.ambassadorId, row.kind, row.periodKey);
      if (!res.ok) { setError(res.error); return; }
      setBonusRows((prev) =>
        prev.map((r) => (r.key === row.key ? { ...r, credited: true } : r))
      );
    });
  };

  const toReview = bonusRows.filter((r) => !r.credited);
  const toReviewTotal = toReview.reduce((s, r) => s + r.amountCents, 0);

  const creditBtn: React.CSSProperties = {
    padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6,
    border: 'none', background: 'var(--success)', color: '#fff', cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 28 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            <Icon name="gift" size={15} /> Bonus à vérifier
          </h2>
          {toReview.length > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)' }}>
              {toReview.length} à valider · {fmtEur(toReviewTotal)}
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 12px' }}>
          Aucun bonus n&apos;est versé automatiquement. Vérifie chaque palier hebdo et défi mensuel,
          puis clique « Créditer » pour l&apos;ajouter au solde de l&apos;ambassadeur.
        </p>

        {error && (
          <div style={{ fontSize: 12.5, color: 'var(--error)', padding: '8px 12px', background: 'var(--error-bg)', borderRadius: 8, marginBottom: 10 }}>
            {error}
          </div>
        )}

        {bonusRows.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            Aucun bonus gagné pour l&apos;instant (les bonus apparaissent une fois la semaine ou le mois clôturé).
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Ambassadeur', 'Bonus', 'Détail', 'Montant', 'Action'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bonusRows.map((r) => (
                <tr key={r.key} style={{ borderBottom: '1px solid var(--border-subtle)', opacity: r.credited ? 0.6 : 1 }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.ambassadorName}</td>
                  <td style={{ padding: '8px 10px' }}>{r.label}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-3)' }}>{r.detail}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--accent)' }}>{fmtEur(r.amountCents)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {r.credited ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, padding: '2px 8px', borderRadius: 99,
                        background: 'var(--success-bg)', color: 'var(--success)', fontWeight: 600,
                      }}>
                        <Icon name="checkCircle" size={12} /> Crédité
                      </span>
                    ) : (
                      <button style={creditBtn} disabled={isPending} onClick={() => handleCredit(r)}>
                        Créditer {fmtEur(r.amountCents)}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
