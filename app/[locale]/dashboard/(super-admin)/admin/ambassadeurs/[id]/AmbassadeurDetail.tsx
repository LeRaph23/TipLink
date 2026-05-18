'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  toggleAmbassador,
  setAmbassadorPayoutsFrozen,
  regenerateAmbassadorSetupToken,
} from '@/actions/admin/ambassadors';

export interface FicheData {
  id: string;
  name: string;
  isActive: boolean;
  payoutsFrozen: boolean;
  createdAt: string;
  email: string | null;
  siret: string | null;
  hasStripe: boolean;
  pinSet: boolean;
  promoCode: string;
  percentageOff: number;
  referralCode: string | null;
  parrain: { id: string; name: string } | null;
  kpis: {
    salesTotal: number;
    voidedCount: number;
    commissionBase: number;
    creditedBonus: number;
    creditedReferral: number;
    earned: number;
    paidOrPending: number;
    available: number;
    weekCount: number;
    weeklyTier: { label: string; emoji: string } | null;
  };
  weekly: { label: string; ventes: number; commission: number }[];
  sales: { id: string; pack: string; commissionCents: number; createdAt: string; voided: boolean; salon: string | null }[];
  payouts: { id: string; amountCents: number; status: string; requestedAt: string; paidAt: string | null; failureReason: string | null }[];
  bonusCredits: { kind: string; periodKey: string; amountCents: number; createdAt: string }[];
  visits: { id: string; salonName: string; salonCity: string; visitedAt: string; flyerLeft: boolean; convinced: 'yes' | 'maybe' | 'no'; rating: number; notes: string | null; followUpAt: string | null; locationVerified: boolean; distanceM: number | null }[];
  filleuls: { id: string; name: string; salesCount: number; validated: boolean }[];
  referralRewards: { id: string; reason: string; amountCents: number; status: string; createdAt: string; creditedAt: string | null }[];
  contracts: { id: string; title: string; status: string; sentAt: string; signedAt: string | null }[];
  emails: { id: string; subject: string; status: string; sentAt: string; templateSlug: string | null }[];
}

const fmtEur = (cents: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

type SectionKey = 'activite' | 'terrain' | 'parrainage' | 'paiements' | 'communications';

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius)', padding: 18,
};
const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 12.5, color: 'var(--text)' };
const actionBtn: React.CSSProperties = {
  padding: '7px 13px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};

function Badge({ children, tone }: { children: React.ReactNode; tone: 'success' | 'neutral' | 'warning' | 'error' | 'accent' }) {
  const map = {
    success: { bg: 'var(--success-bg)', fg: 'var(--success)' },
    neutral: { bg: 'var(--neutral-bg)', fg: 'var(--neutral)' },
    warning: { bg: 'var(--warning-bg)', fg: 'var(--warning)' },
    error: { bg: 'var(--error-bg)', fg: 'var(--error)' },
    accent: { bg: 'var(--accent-muted)', fg: 'var(--accent)' },
  }[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600,
      background: map.bg, color: map.fg,
    }}>
      {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{children}</div>;
}

function payoutTone(status: string): 'success' | 'neutral' | 'warning' | 'error' {
  if (status === 'paid') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'failed') return 'error';
  return 'neutral';
}

export function AmbassadeurDetail({ data }: { data: FicheData }) {
  const router = useRouter();
  const [tab, setTab] = useState<SectionKey>('activite');
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [regen, setRegen] = useState<{ url: string; expiresAt: string } | null>(null);

  const k = data.kpis;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { setErr(res.error ?? 'Erreur'); return; }
      router.refresh();
    });
  };

  const handleRegen = () => {
    setErr(null);
    startTransition(async () => {
      const res = await regenerateAmbassadorSetupToken(data.id);
      if (!res.ok) { setErr(res.error); return; }
      setRegen({ url: res.setupUrl, expiresAt: res.expiresAt });
      router.refresh();
    });
  };

  const tabs: { key: SectionKey; label: string; count?: number }[] = [
    { key: 'activite', label: 'Activité', count: data.sales.length },
    { key: 'terrain', label: 'Terrain', count: data.visits.length },
    { key: 'parrainage', label: 'Parrainage', count: data.filleuls.length },
    { key: 'paiements', label: 'Paiements', count: data.payouts.length },
    { key: 'communications', label: 'Communications', count: data.contracts.length + data.emails.length },
  ];

  return (
    <div>
      <Link
        href="/dashboard/admin/ambassadeurs/equipe"
        style={{ fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none', display: 'inline-block', marginBottom: 12 }}
      >
        ← Retour à l&apos;équipe
      </Link>

      {/* Header */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>
                {data.name}
              </h2>
              <Badge tone={data.isActive ? 'success' : 'neutral'}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                {data.isActive ? 'Actif' : 'Inactif'}
              </Badge>
              {data.payoutsFrozen && <Badge tone="warning">❄ Virements gelés</Badge>}
              {k.weeklyTier && <Badge tone="accent">{k.weeklyTier.emoji} Palier {k.weeklyTier.label}</Badge>}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
              <span>Code <strong style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono, monospace)' }}>{data.promoCode || '—'}</strong>{data.percentageOff > 0 ? ` (-${data.percentageOff}%)` : ''}</span>
              <span>Inscrit le {fmtDate(data.createdAt)}</span>
              {data.email && <span>{data.email}</span>}
              {data.siret && <span>SIRET {data.siret}</span>}
              {data.parrain && (
                <span>
                  Parrain :{' '}
                  <Link href={`/dashboard/admin/ambassadeurs/${data.parrain.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                    {data.parrain.name}
                  </Link>
                </span>
              )}
              <span>{data.pinSet ? '🔒 PIN défini' : '⚠ PIN non défini'}</span>
              <span>{data.hasStripe ? '✓ Stripe connecté' : 'Stripe non configuré'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {data.promoCode && (
              <a
                href={`/api/admin/ambassador-session/${data.promoCode.toLowerCase()}`}
                target="_blank"
                rel="noreferrer"
                style={{ ...actionBtn, textDecoration: 'none' }}
              >
                Dashboard ↗
              </a>
            )}
            <button style={actionBtn} disabled={isPending} onClick={() => run(() => toggleAmbassador(data.id, !data.isActive))}>
              {data.isActive ? 'Désactiver' : 'Activer'}
            </button>
            <button style={actionBtn} disabled={isPending} onClick={() => run(() => setAmbassadorPayoutsFrozen(data.id, !data.payoutsFrozen))}>
              {data.payoutsFrozen ? '☀ Dégeler' : '❄ Geler'}
            </button>
            <button style={actionBtn} disabled={isPending} onClick={handleRegen}>
              🔗 Nouveau lien
            </button>
          </div>
        </div>
        {err && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--error)', padding: '8px 12px', background: 'var(--error-bg)', borderRadius: 8 }}>
            {err}
          </div>
        )}
        {regen && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-2)', padding: '10px 12px', background: 'var(--success-bg)', borderRadius: 8 }}>
            <div style={{ fontWeight: 700, color: 'var(--success)', marginBottom: 4 }}>Nouveau lien d&apos;activation — expire le {new Date(regen.expiresAt).toLocaleString('fr-FR')}</div>
            <code style={{ wordBreak: 'break-all', display: 'block', background: 'var(--surface-2)', padding: '6px 8px', borderRadius: 4 }}>{regen.url}</code>
          </div>
        )}
      </div>

      {/* KPI strip */}
      <div className="dash-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Kpi label="Ventes valides" value={String(k.salesTotal)} sub={k.voidedCount > 0 ? `${k.voidedCount} annulée(s)` : undefined} />
        <Kpi label="Cette semaine" value={String(k.weekCount)} sub={k.weeklyTier ? `Palier ${k.weeklyTier.label}` : 'Aucun palier'} />
        <Kpi label="Total gagné" value={fmtEur(k.earned)} sub={`dont ${fmtEur(k.creditedBonus + k.creditedReferral)} bonus`} />
        <Kpi label="Déjà versé" value={fmtEur(k.paidOrPending)} />
        <Kpi label="Solde dû" value={fmtEur(k.available)} highlight={k.available > 0} />
      </div>

      {/* Section tabs */}
      <div className="dash-tabs" style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '9px 15px', background: 'transparent', border: 'none',
              borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`,
              color: tab === t.key ? 'var(--accent)' : 'var(--text-3)',
              fontSize: 13, fontWeight: tab === t.key ? 700 : 500, cursor: 'pointer', marginBottom: -1,
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}{t.count != null ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {tab === 'activite' && <ActiviteSection data={data} />}
      {tab === 'terrain' && <TerrainSection data={data} />}
      {tab === 'parrainage' && <ParrainageSection data={data} />}
      {tab === 'paiements' && <PaiementsSection data={data} />}
      {tab === 'communications' && <CommunicationsSection data={data} />}
    </div>
  );
}

function Kpi({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${highlight ? 'var(--accent)' : 'var(--border-subtle)'}`,
      borderRadius: 'var(--radius)', padding: 14,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: highlight ? 'var(--accent)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: highlight ? 'var(--accent)' : 'var(--text)', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ActiviteSection({ data }: { data: FicheData }) {
  const hasChart = data.weekly.some((w) => w.ventes > 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 14px' }}>Ventes par semaine</h3>
        {hasChart ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.weekly} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                cursor={{ fill: 'var(--surface-2)' }}
              />
              <Bar dataKey="ventes" name="Ventes" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty>Aucune vente sur les 10 dernières semaines.</Empty>
        )}
      </section>

      <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, padding: '16px 18px 10px' }}>
          Historique des ventes
        </h3>
        {data.sales.length === 0 ? (
          <Empty>Aucune vente enregistrée.</Empty>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)' }}>
                <tr><th style={thStyle}>Date</th><th style={thStyle}>Pack</th><th style={thStyle}>Établissement</th><th style={thStyle}>Commission</th><th style={thStyle}>Statut</th></tr>
              </thead>
              <tbody>
                {data.sales.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)', opacity: s.voided ? 0.5 : 1 }}>
                    <td style={tdStyle}>{fmtDate(s.createdAt)}</td>
                    <td style={tdStyle}><span style={{ textTransform: 'capitalize' }}>{s.pack}</span></td>
                    <td style={tdStyle}>{s.salon ?? '—'}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: s.voided ? 'var(--text-3)' : 'var(--success)' }}>{fmtEur(s.commissionCents)}</td>
                    <td style={tdStyle}>{s.voided ? <Badge tone="error">Annulée</Badge> : <Badge tone="success">Valide</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function TerrainSection({ data }: { data: FicheData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, padding: '16px 18px 10px' }}>
          Visites terrain
        </h3>
        {data.visits.length === 0 ? (
          <Empty>Aucune visite enregistrée.</Empty>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)' }}>
                <tr><th style={thStyle}>Date</th><th style={thStyle}>Établissement</th><th style={thStyle}>Convaincu</th><th style={thStyle}>Potentiel</th><th style={thStyle}>GPS</th><th style={thStyle}>Notes</th></tr>
              </thead>
              <tbody>
                {data.visits.map((v) => (
                  <tr key={v.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={tdStyle}>{fmtDate(v.visitedAt)}</td>
                    <td style={tdStyle}><strong>{v.salonName}</strong><span style={{ color: 'var(--text-3)' }}> · {v.salonCity}</span></td>
                    <td style={tdStyle}>{v.convinced === 'yes' ? '✓ Oui' : v.convinced === 'maybe' ? '~ Peut-être' : 'Non'}</td>
                    <td style={tdStyle}>{v.rating}/3</td>
                    <td style={tdStyle}>
                      {v.locationVerified
                        ? <Badge tone="success">📍 {v.distanceM != null ? `${v.distanceM} m` : 'Vérifié'}</Badge>
                        : v.distanceM != null
                          ? <Badge tone="warning">⚠ {v.distanceM} m</Badge>
                          : <span style={{ color: 'var(--text-3)' }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.notes ?? ''}>
                      {v.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ParrainageSection({ data }: { data: FicheData }) {
  const reasonLabel: Record<string, string> = {
    validation: 'Filleul validé (3 ventes)',
    milestone_5: 'Palier 5 filleuls',
    milestone_10: 'Palier 10 filleuls',
  };
  const rewardTone: Record<string, 'success' | 'warning' | 'neutral'> = {
    credited: 'success', pending: 'warning', voided: 'neutral',
  };
  const validatedCount = data.filleuls.filter((f) => f.validated).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '16px 18px 10px' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Filleuls</h3>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{validatedCount} validé(s) sur {data.filleuls.length}</span>
        </div>
        {data.filleuls.length === 0 ? (
          <Empty>Cet ambassadeur n&apos;a parrainé personne.</Empty>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={thStyle}>Filleul</th><th style={thStyle}>Ventes valides</th><th style={thStyle}>État</th></tr></thead>
              <tbody>
                {data.filleuls.map((f) => (
                  <tr key={f.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      <Link href={`/dashboard/admin/ambassadeurs/${f.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                        {f.name}
                      </Link>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{f.salesCount}</td>
                    <td style={tdStyle}>{f.validated ? <Badge tone="success">Validé</Badge> : <Badge tone="neutral">En cours</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, padding: '16px 18px 10px' }}>
          Primes de parrainage
        </h3>
        {data.referralRewards.length === 0 ? (
          <Empty>Aucune prime de parrainage.</Empty>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={thStyle}>Récompense</th><th style={thStyle}>Montant</th><th style={thStyle}>Statut</th><th style={thStyle}>Créée le</th></tr></thead>
              <tbody>
                {data.referralRewards.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={tdStyle}>{reasonLabel[r.reason] ?? r.reason}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--accent)' }}>{fmtEur(r.amountCents)}</td>
                    <td style={tdStyle}><Badge tone={rewardTone[r.status] ?? 'neutral'}>{r.status}</Badge></td>
                    <td style={tdStyle}>{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PaiementsSection({ data }: { data: FicheData }) {
  const kindLabel: Record<string, string> = {
    weekly_tier: 'Palier hebdomadaire',
    monthly_challenge: 'Défi mensuel',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, padding: '16px 18px 10px' }}>
          Virements
        </h3>
        {data.payouts.length === 0 ? (
          <Empty>Aucun virement demandé.</Empty>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={thStyle}>Montant</th><th style={thStyle}>Statut</th><th style={thStyle}>Demandé le</th><th style={thStyle}>Payé le</th></tr></thead>
              <tbody>
                {data.payouts.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtEur(p.amountCents)}</td>
                    <td style={tdStyle}>
                      <Badge tone={payoutTone(p.status)}>{p.status}</Badge>
                      {p.failureReason && <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>{p.failureReason}</span>}
                    </td>
                    <td style={tdStyle}>{fmtDateTime(p.requestedAt)}</td>
                    <td style={tdStyle}>{p.paidAt ? fmtDateTime(p.paidAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, padding: '16px 18px 10px' }}>
          Bonus crédités
        </h3>
        {data.bonusCredits.length === 0 ? (
          <Empty>Aucun bonus crédité.</Empty>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={thStyle}>Type</th><th style={thStyle}>Période</th><th style={thStyle}>Montant</th><th style={thStyle}>Crédité le</th></tr></thead>
              <tbody>
                {data.bonusCredits.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={tdStyle}>{kindLabel[c.kind] ?? c.kind}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-3)', fontSize: 11.5 }}>{c.periodKey}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--success)' }}>{fmtEur(c.amountCents)}</td>
                    <td style={tdStyle}>{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CommunicationsSection({ data }: { data: FicheData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, padding: '16px 18px 10px' }}>
          Contrats
        </h3>
        {data.contracts.length === 0 ? (
          <Empty>Aucun contrat.</Empty>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={thStyle}>Titre</th><th style={thStyle}>Statut</th><th style={thStyle}>Envoyé le</th><th style={thStyle}>Signé le</th></tr></thead>
              <tbody>
                {data.contracts.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{c.title}</td>
                    <td style={tdStyle}><Badge tone={c.status === 'signed' ? 'success' : c.status === 'sent' ? 'warning' : 'neutral'}>{c.status}</Badge></td>
                    <td style={tdStyle}>{fmtDate(c.sentAt)}</td>
                    <td style={tdStyle}>{c.signedAt ? fmtDate(c.signedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, padding: '16px 18px 10px' }}>
          Emails envoyés
        </h3>
        {data.emails.length === 0 ? (
          <Empty>Aucun email envoyé.</Empty>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)' }}>
                <tr><th style={thStyle}>Sujet</th><th style={thStyle}>Statut</th><th style={thStyle}>Envoyé le</th></tr>
              </thead>
              <tbody>
                {data.emails.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{e.subject}</td>
                    <td style={tdStyle}><Badge tone={e.status === 'sent' ? 'success' : e.status === 'failed' ? 'error' : 'neutral'}>{e.status}</Badge></td>
                    <td style={tdStyle}>{fmtDateTime(e.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
