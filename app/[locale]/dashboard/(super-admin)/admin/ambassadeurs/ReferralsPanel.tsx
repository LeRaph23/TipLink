'use client';

import { useState, useTransition } from 'react';
import { creditReferralPayout, voidReferralPayout } from '@/actions/admin/ambassadors';
import { REFERRAL_VALIDATION_MIN_SALES } from '@/lib/ambassador-tiers';
import { Icon } from '@/components/ambassadeur/icons';

export interface ReferralFilleulRow {
  filleulId: string;
  filleulName: string;
  parrainName: string;
  liveSales: number;
  validated: boolean;
  payoutId: string | null;
  payoutStatus: 'pending' | 'credited' | 'voided' | null;
  payoutAmountCents: number;
  creditedAt: string | null;
}

export interface ReferralMilestoneRow {
  payoutId: string;
  parrainName: string;
  reason: 'milestone_5' | 'milestone_10';
  amountCents: number;
  payoutStatus: 'pending' | 'credited' | 'voided';
  creditedAt: string | null;
}

const fmtEur = (cents: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em',
  borderBottom: '1px solid var(--border)',
};

function StatusBadge({ status }: { status: 'pending' | 'credited' | 'voided' }) {
  const cfg = {
    pending:  { label: 'À valider', bg: 'var(--warning-bg)', color: 'var(--warning)' },
    credited: { label: 'Crédité',   bg: 'var(--success-bg)', color: 'var(--success)' },
    voided:   { label: 'Annulé',    bg: 'var(--neutral-bg)', color: 'var(--neutral)' },
  }[status];
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 99,
      background: cfg.bg, color: cfg.color, fontWeight: 600,
    }}>
      {cfg.label}
    </span>
  );
}

export function ReferralsPanel({
  filleuls,
  milestones,
}: {
  filleuls: ReferralFilleulRow[];
  milestones: ReferralMilestoneRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filleulRows, setFilleulRows] = useState(filleuls);
  const [milestoneRows, setMilestoneRows] = useState(milestones);

  const applyStatus = (payoutId: string, status: 'credited' | 'voided') => {
    setFilleulRows((prev) =>
      prev.map((r) =>
        r.payoutId === payoutId
          ? { ...r, payoutStatus: status, creditedAt: status === 'credited' ? new Date().toISOString() : r.creditedAt }
          : r
      )
    );
    setMilestoneRows((prev) =>
      prev.map((r) =>
        r.payoutId === payoutId
          ? { ...r, payoutStatus: status, creditedAt: status === 'credited' ? new Date().toISOString() : r.creditedAt }
          : r
      )
    );
  };

  const handleCredit = (payoutId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await creditReferralPayout(payoutId);
      if (!res.ok) { setError(res.error); return; }
      applyStatus(payoutId, 'credited');
    });
  };

  const handleVoid = (payoutId: string) => {
    if (!confirm('Refuser cette prime de parrainage ? Elle ne sera pas créditée.')) return;
    setError(null);
    startTransition(async () => {
      const res = await voidReferralPayout(payoutId);
      if (!res.ok) { setError(res.error); return; }
      applyStatus(payoutId, 'voided');
    });
  };

  const creditBtn: React.CSSProperties = {
    padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6,
    border: 'none', background: 'var(--success)', color: '#fff', cursor: 'pointer',
  };
  const voidBtn: React.CSSProperties = {
    padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 6,
    border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 28 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 18 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>
          <Icon name="handshake" size={15} /> Parrainages : primes à valider
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 12px' }}>
          Une prime de 25 € est due au parrain dès que son filleul atteint {REFERRAL_VALIDATION_MIN_SALES} ventes
          valides. Vous déclenchez le crédit au solde du parrain avec « Créditer ».
        </p>

        {error && (
          <div style={{ fontSize: 12.5, color: 'var(--error)', padding: '8px 12px', background: 'var(--error-bg)', borderRadius: 8, marginBottom: 10 }}>
            {error}
          </div>
        )}

        {filleulRows.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            Aucun filleul pour le moment. Liez un parrain à la création d&apos;un ambassadeur.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Filleul', 'Parrain', 'Ventes valides', 'Prime', 'Action'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filleulRows.map((r) => {
                const reached = r.liveSales >= REFERRAL_VALIDATION_MIN_SALES;
                return (
                  <tr key={r.filleulId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.filleulName}</td>
                    <td style={{ padding: '8px 10px' }}>{r.parrainName}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: reached ? 'var(--success)' : 'var(--text-3)' }}>
                      {r.liveSales} / {REFERRAL_VALIDATION_MIN_SALES}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {r.payoutStatus
                        ? <StatusBadge status={r.payoutStatus} />
                        : <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>}
                      {r.payoutStatus === 'credited' && r.creditedAt && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>
                          {fmtEur(r.payoutAmountCents)} · {new Date(r.creditedAt).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {r.payoutStatus === 'pending' && r.payoutId ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={creditBtn} disabled={isPending} onClick={() => handleCredit(r.payoutId!)}>
                            Créditer {fmtEur(r.payoutAmountCents)}
                          </button>
                          <button style={voidBtn} disabled={isPending} onClick={() => handleVoid(r.payoutId!)}>
                            Refuser
                          </button>
                        </div>
                      ) : r.payoutStatus === 'credited' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--success)' }}><Icon name="checkCircle" size={12} /> Versé au solde</span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {reached ? 'En cours…' : `${REFERRAL_VALIDATION_MIN_SALES - r.liveSales} vente(s) restante(s)`}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {milestoneRows.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 18 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>
            🏅 Paliers parrain (5 / 10 filleuls validés)
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Parrain', 'Palier', 'Montant', 'Prime', 'Action'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {milestoneRows.map((r) => (
                <tr key={r.payoutId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.parrainName}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {r.reason === 'milestone_5' ? '5 filleuls' : '10 filleuls'}
                  </td>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--accent)' }}>{fmtEur(r.amountCents)}</td>
                  <td style={{ padding: '8px 10px' }}><StatusBadge status={r.payoutStatus} /></td>
                  <td style={{ padding: '8px 10px' }}>
                    {r.payoutStatus === 'pending' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={creditBtn} disabled={isPending} onClick={() => handleCredit(r.payoutId)}>
                          Créditer {fmtEur(r.amountCents)}
                        </button>
                        <button style={voidBtn} disabled={isPending} onClick={() => handleVoid(r.payoutId)}>
                          Refuser
                        </button>
                      </div>
                    ) : r.payoutStatus === 'credited' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--success)' }}><Icon name="checkCircle" size={12} /> Versé au solde</span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
