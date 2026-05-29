'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AmbassadeurPayoutPanel } from './AmbassadeurBanking';
import { AmbassadeurContracts } from './AmbassadeurContracts';
import { AmbassadeurReferralPanel } from './AmbassadeurReferralPanel';
import { AmbassadeurSalonsTracker } from './AmbassadeurSalonsTracker';
import { AmbassadeurStatement } from './AmbassadeurStatement';
import { Card, SectionHeader, Badge, Stat, ProgressBar, EmptyState, FONT, WEIGHT, SPACE } from './ui';
import { Icon } from './icons';

type AuthState = 'loading' | 'pin-required' | 'pin-setup' | 'pin-setup-invalid' | 'authenticated';
type TabId = 'ventes' | 'terrain' | 'gains';

interface TierInfo {
  id: string;
  label: string;
  emoji: string;
  threshold: number;
  bonus: number;
  unlocked: boolean;
}

interface StatsData {
  name: string;
  allTimeSalesCount: number;
  weekCount: number;
  monthCount: number;
  totalBaseCommission: number;
  closedWeeklyBonuses: number;
  earnedTotal: number;
  weeklyTier: { id: string; label: string; bonus: number } | null;
  weeklyBonusCents: number;
  monthlyChallenge: { prizeCents: number; prize: string; endsAt: string } | null;
  challengePrizeCents: number;
  tiers: TierInfo[];
  leaderboard: {
    rank: number;
    total: number;
    top3: Array<{ rank: number; firstName: string; count: number; isYou: boolean }>;
  } | null;
  recentSales: Array<{
    id: string;
    pack: string;
    commission_amount: number;
    salon_name_partial: string | null;
    created_at: string;
  }>;
}

interface BankingState {
  hasStripeAccount: boolean;
  onboardingStatus: string;
  siret: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  needsIdentityDocument?: boolean;
  pendingVerification?: boolean;
  payoutsEnabled?: boolean;
}

interface PayoutState {
  available: number;
  earnedTotal: number;
  paidOrPendingTotal: number;
  minPayoutCents: number;
  history: Array<{ id: string; amount_cents: number; status: string; requested_at: string; paid_at: string | null }>;
}

// Maps tier id → DigiTip CSS variables (theme-aware, no hardcoded hex).
const TIER_VARS: Record<string, { color: string; bg: string; border: string }> = {
  gold:   { color: 'var(--warning)',  bg: 'var(--warning-bg)',  border: 'var(--warning)' },
  silver: { color: 'var(--neutral)',  bg: 'var(--neutral-bg)',  border: 'var(--neutral)' },
  bronze: { color: 'var(--accent)',   bg: 'var(--accent-muted)', border: 'var(--accent-border)' },
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'ventes', label: 'Mes ventes' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'gains', label: 'Mes gains' },
];

const TOPBAR_H = 56;

function fmtEuros(cents: number) {
  return `${Math.round(cents / 100)}€`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function TierCard({ tier, weekCount }: { tier: TierInfo; weekCount: number }) {
  const vars = TIER_VARS[tier.id] ?? TIER_VARS.bronze;
  const remaining = Math.max(0, tier.threshold - weekCount);

  return (
    <div style={{
      background: tier.unlocked ? vars.bg : 'var(--surface-2)',
      border: `1px solid ${tier.unlocked ? vars.border : 'var(--border-subtle)'}`,
      borderRadius: 'var(--radius)',
      padding: '12px 10px',
      flex: 1,
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: SPACE.sm }}>
        <span style={{
          fontSize: FONT.label, fontWeight: WEIGHT.bold,
          color: tier.unlocked ? vars.color : 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          {tier.label}
        </span>
        {tier.unlocked && <Icon name="check" size={13} strokeWidth={2.5} color={vars.color} />}
      </div>
      <div style={{
        fontSize: FONT.bodyLg, fontWeight: WEIGHT.heavy, letterSpacing: '-0.03em',
        color: tier.unlocked ? vars.color : 'var(--text)', marginBottom: SPACE.sm,
      }}>
        +{fmtEuros(tier.bonus)}
      </div>
      <ProgressBar value={weekCount} max={tier.threshold} color={tier.unlocked ? vars.color : 'var(--border)'} />
      <div style={{ marginTop: 6, fontSize: FONT.micro, color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between', gap: 4 }}>
        <span>{Math.min(weekCount, tier.threshold)}/{tier.threshold}</span>
        {!tier.unlocked && <span>{remaining} rest.</span>}
      </div>
    </div>
  );
}

function PinInput({ onSubmit, error, loading }: {
  onSubmit: (pin: string) => void;
  error: string | null;
  loading: boolean;
}) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => { refs[0].current?.focus(); }, []);

  const handleChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = digit;
    setDigits(next);
    if (digit && i < 3) refs[i + 1].current?.focus();
    if (next.every(d => d !== '')) onSubmit(next.join(''));
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs[i - 1].current?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 4) {
      setDigits(pasted.split(''));
      refs[3].current?.focus();
      onSubmit(pasted);
    }
    e.preventDefault();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={refs[i]}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={d}
            disabled={loading}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            onPaste={handlePaste}
            style={{
              width: 56, height: 64,
              textAlign: 'center',
              fontSize: 26, fontWeight: 700,
              background: 'var(--surface-2)',
              border: `2px solid ${d ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              color: 'var(--text)',
              outline: 'none',
              caretColor: 'transparent',
              transition: 'border-color 150ms',
            }}
          />
        ))}
      </div>
      {error && (
        <div style={{
          background: 'var(--error-bg)', color: 'var(--error)',
          borderRadius: 'var(--radius-sm)', padding: '10px 14px',
          fontSize: FONT.body, fontWeight: WEIGHT.medium, textAlign: 'center', marginBottom: 16,
        }}>
          {error}
        </div>
      )}
      {loading && (
        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: FONT.body }}>
          Vérification…
        </div>
      )}
    </div>
  );
}

export function AmbassadeurDashboard({ code }: { code: string }) {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [ambassadorName, setAmbassadorName] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [banking, setBanking] = useState<BankingState | null>(null);
  const [payoutData, setPayoutData] = useState<PayoutState | null>(null);
  // Initial tab honours a ?tab= deep-link (e.g. links from admin emails).
  const [tab, setTab] = useState<TabId>(() => {
    if (typeof window === 'undefined') return 'ventes';
    const t = new URL(window.location.href).searchParams.get('tab');
    if (t === 'contracts' || t === 'salons') return 'terrain';
    if (t === 'payout' || t === 'banking' || t === 'referrals') return 'gains';
    return 'ventes';
  });

  const refreshBankingAndPayout = useCallback(() => {
    fetch(`/api/ambassadeur/${encodeURIComponent(code)}/banking`)
      .then(r => r.json())
      .then(d => { if (!d.error) setBanking(d); })
      .catch(() => {});
    fetch(`/api/ambassadeur/${encodeURIComponent(code)}/payout`)
      .then(r => r.json())
      .then(d => { if (!d.error) setPayoutData(d); })
      .catch(() => {});
  }, [code]);

  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    const url = typeof window !== 'undefined' ? new URL(window.location.href) : null;
    const tok = url?.searchParams.get('setup');

    if (tok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads window.location, unavailable during SSR
      setSetupToken(tok);
      fetch(`/api/ambassadeur/${encodeURIComponent(code)}/set-pin?token=${encodeURIComponent(tok)}`)
        .then(r => r.json().then(d => ({ status: r.status, d })))
        .then(({ status, d }) => {
          if (status === 200 && d.valid) {
            setAmbassadorName(d.name ?? '');
            setAuthState('pin-setup');
          } else {
            setSetupError(d.error ?? 'Lien invalide');
            setAuthState('pin-setup-invalid');
          }
        })
        .catch(() => { setSetupError('Erreur réseau'); setAuthState('pin-setup-invalid'); });
      return;
    }

    fetch(`/api/ambassadeur/${encodeURIComponent(code)}/auth`)
      .then(r => r.json())
      .then(data => {
        if (data.authenticated) {
          setAmbassadorName(data.name ?? '');
          setAuthState('authenticated');
        } else {
          setAuthState('pin-required');
        }
      })
      .catch(() => setAuthState('pin-required'));
  }, [code]);

  const handleSetupPin = useCallback(async (pin: string) => {
    if (!setupToken) return;
    setPinLoading(true);
    setPinError(null);
    try {
      const res = await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/set-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, token: setupToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPinError(data.error ?? 'Échec de la configuration');
      } else {
        // Strip the ?setup= param from the URL and switch to authenticated state
        if (typeof window !== 'undefined') {
          const u = new URL(window.location.href);
          u.searchParams.delete('setup');
          window.history.replaceState({}, '', u.pathname + (u.search ? '?' + u.searchParams.toString() : ''));
        }
        setAmbassadorName(data.name ?? '');
        setAuthState('authenticated');
      }
    } catch {
      setPinError('Erreur réseau. Réessayez.');
    } finally {
      setPinLoading(false);
    }
  }, [code, setupToken]);

  useEffect(() => {
    if (authState !== 'authenticated') return;
    fetch(`/api/ambassadeur/${encodeURIComponent(code)}/stats`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setStatsError(data.error); return; }
        setStats(data);
        setAmbassadorName(prev => data.name?.split(' ')[0] ?? prev);
      })
      .catch(() => setStatsError('Impossible de charger les stats.'));
    refreshBankingAndPayout();
  }, [authState, code, refreshBankingAndPayout]);

  const handlePin = useCallback(async (pin: string) => {
    setPinLoading(true);
    setPinError(null);
    try {
      const res = await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setPinError(data.error ?? 'Trop de tentatives. Réessayez dans 15 min.');
      } else if (!res.ok) {
        setPinError(data.error ?? 'PIN incorrect.');
      } else {
        setAmbassadorName(data.name ?? '');
        setAuthState('authenticated');
      }
    } catch {
      setPinError('Erreur réseau. Réessayez.');
    } finally {
      setPinLoading(false);
    }
  }, [code]);

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (authState === 'loading') {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
          animation: 'spin 0.7s linear infinite',
        }} />
      </div>
    );
  }

  // ── PIN setup (first login via admin link) ───────────────────────────────────
  if (authState === 'pin-setup') {
    return (
      <div style={{
        minHeight: '100dvh', background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 20px', fontFamily: 'var(--font)',
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--accent)', letterSpacing: '-0.03em', marginBottom: 6 }}>
              DigiTip
            </div>
            <div style={{ fontSize: FONT.label, fontWeight: WEIGHT.semibold, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Première connexion · {code.toUpperCase()}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '28px 24px' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: WEIGHT.bold, color: 'var(--text)', marginBottom: 6 }}>
                Bienvenue {ambassadorName}
              </div>
              <div style={{ fontSize: FONT.body, color: 'var(--text-3)', lineHeight: 1.5 }}>
                Choisissez votre <strong>PIN à 4 chiffres</strong>. Vous l&apos;utiliserez à chaque connexion — notez-le quelque part.
              </div>
            </div>
            <PinInput onSubmit={handleSetupPin} error={pinError} loading={pinLoading} />
          </div>
        </div>
      </div>
    );
  }

  if (authState === 'pin-setup-invalid') {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', fontFamily: 'var(--font)' }}>
        <div style={{ maxWidth: 360, textAlign: 'center', padding: 28, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <Icon name="alert" size={30} color="var(--warning)" />
          </div>
          <div style={{ fontSize: FONT.bodyLg + 1, fontWeight: WEIGHT.bold, color: 'var(--text)', marginBottom: SPACE.sm }}>
            Lien d&apos;activation invalide
          </div>
          <div style={{ fontSize: FONT.body, color: 'var(--text-3)', lineHeight: 1.5 }}>
            {setupError ?? 'Ce lien n\'est plus valable.'} Contactez Digitip pour en recevoir un nouveau.
          </div>
        </div>
      </div>
    );
  }

  // ── PIN required ──────────────────────────────────────────────────────────────
  if (authState === 'pin-required') {
    return (
      <div style={{
        minHeight: '100dvh', background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 20px',
        fontFamily: 'var(--font)',
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--accent)', letterSpacing: '-0.03em', marginBottom: 6 }}>
              DigiTip
            </div>
            <div style={{ fontSize: FONT.label, fontWeight: WEIGHT.semibold, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Ambassadeur · {code.toUpperCase()}
            </div>
          </div>

          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-xl)',
            padding: '28px 24px',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: FONT.bodyLg + 1, fontWeight: WEIGHT.bold, color: 'var(--text)', marginBottom: 4 }}>
                Votre PIN à 4 chiffres
              </div>
              <div style={{ fontSize: FONT.body, color: 'var(--text-3)' }}>
                Pour accéder à votre dashboard
              </div>
            </div>

            <PinInput onSubmit={handlePin} error={pinError} loading={pinLoading} />
          </div>
        </div>
      </div>
    );
  }

  // ── Authenticated — stats loading ─────────────────────────────────────────────
  if (!stats) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)' }}>
        {statsError
          ? <div style={{ color: 'var(--error)', fontSize: 14, padding: '0 20px', textAlign: 'center' }}>{statsError}</div>
          : <div style={{ color: 'var(--text-3)', fontSize: 14 }}>Chargement…</div>
        }
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────────
  const { weekCount, monthCount, totalBaseCommission, weeklyBonusCents, tiers, recentSales } = stats;
  const firstName = ambassadorName.split(' ')[0];

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>

      {/* Top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        height: TOPBAR_H,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: FONT.micro, fontWeight: WEIGHT.semibold, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Ambassadeur · {code.toUpperCase()}
          </div>
          <div style={{ fontSize: FONT.bodyLg, fontWeight: WEIGHT.heavy, color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', lineHeight: 1.2, marginTop: 1 }}>
            Bonjour {firstName}
          </div>
        </div>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--accent-muted)',
          border: '2px solid var(--accent-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: 'var(--accent)',
          flexShrink: 0,
        }}>
          {firstName.charAt(0).toUpperCase()}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 48px' }}>

        {/* Hero stats */}
        <div className="dash-stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.sm, marginBottom: SPACE.lg }}>
          <Card style={{ marginBottom: 0 }}>
            <Stat
              label="Cette semaine"
              value={weekCount}
              size="lg"
              sub={`${stats.allTimeSalesCount} vente${stats.allTimeSalesCount !== 1 ? 's' : ''} au total`}
            />
          </Card>
          <Card style={{ marginBottom: 0 }}>
            <Stat
              label="Commissions"
              value={fmtEuros(totalBaseCommission)}
              tone="accent"
              sub={weeklyBonusCents > 0
                ? <span style={{ color: 'var(--success)', fontWeight: WEIGHT.semibold }}>+{fmtEuros(weeklyBonusCents)} bonus</span>
                : undefined}
            />
          </Card>
        </div>

        {/* Tabs */}
        <div
          className="dash-tabs"
          style={{
            position: 'sticky', top: TOPBAR_H, zIndex: 9,
            display: 'flex', gap: 4,
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: SPACE.lg,
          }}
        >
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, minHeight: 44, padding: '10px 8px',
                  background: 'transparent', border: 'none',
                  borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  color: active ? 'var(--accent)' : 'var(--text-3)',
                  fontSize: FONT.body, fontWeight: WEIGHT.bold,
                  fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Tab: Mes ventes ── */}
        {tab === 'ventes' && (
          <>
            {/* Paliers de la semaine */}
            <div style={{ marginBottom: SPACE.lg }}>
              <SectionHeader title="Paliers de la semaine" />
              <div style={{ fontSize: FONT.label, color: 'var(--text-3)', fontStyle: 'italic', margin: '4px 0 10px' }}>
                Un seul bonus — le palier le plus élevé atteint
              </div>
              <div style={{ display: 'flex', gap: SPACE.sm }}>
                {tiers.map(tier => (
                  <TierCard key={tier.id} tier={tier} weekCount={weekCount} />
                ))}
              </div>
            </div>

            <MonthlyChallenge stats={stats} monthCount={monthCount} />

            {/* Dernières ventes */}
            <Card padded={false}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <SectionHeader title="Dernières ventes" />
              </div>
              {recentSales.length === 0 ? (
                <EmptyState>Aucune vente pour l&apos;instant. Continuez !</EmptyState>
              ) : (
                recentSales.map((sale, idx) => (
                  <div key={sale.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr auto auto',
                    gap: SPACE.sm, padding: '12px 16px', alignItems: 'center',
                    borderBottom: idx < recentSales.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: FONT.label, color: 'var(--text-3)' }}>{fmtDate(sale.created_at)}</div>
                      <div style={{ fontSize: FONT.body, fontWeight: WEIGHT.medium, color: 'var(--text-2)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sale.salon_name_partial ?? '***'}
                      </div>
                    </div>
                    <Badge tone={sale.pack === 'duo' ? 'accent' : 'success'}>{sale.pack}</Badge>
                    <div style={{ fontSize: FONT.body, fontWeight: WEIGHT.bold, color: 'var(--success)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      +{fmtEuros(sale.commission_amount)}
                    </div>
                  </div>
                ))
              )}
            </Card>
          </>
        )}

        {/* ── Tab: Terrain ── */}
        {tab === 'terrain' && (
          <>
            <AmbassadeurSalonsTracker code={code} />
            <AmbassadeurContracts code={code} />
          </>
        )}

        {/* ── Tab: Mes gains ── */}
        {tab === 'gains' && (
          <>
            <AmbassadeurReferralPanel code={code} />
            {banking && (
              <AmbassadeurPayoutPanel
                code={code}
                banking={banking}
                payout={payoutData}
                onChanged={refreshBankingAndPayout}
              />
            )}
            <AmbassadeurStatement code={code} />
          </>
        )}

      </div>
    </div>
  );
}

// Monthly challenge — rendered only when a super-admin has activated one.
function MonthlyChallenge({ stats, monthCount }: { stats: StatsData; monthCount: number }) {
  const lb = stats.leaderboard;
  const mc = stats.monthlyChallenge;
  if (!lb || !mc) return null;

  const isLeader = lb.rank === 1;
  const top3 = lb.top3 ?? [];
  const leader = top3[0];
  const gapToLeader = leader && !leader.isYou ? Math.max(0, leader.count - monthCount) : 0;
  const endsLabel = new Date(mc.endsAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' });

  const rankTone = (rank: number) =>
    rank === 1 ? { bg: 'var(--warning-bg)', fg: 'var(--warning)' }
    : rank === 2 ? { bg: 'var(--neutral-bg)', fg: 'var(--neutral)' }
    : { bg: 'var(--accent-muted)', fg: 'var(--accent)' };

  return (
    <Card style={isLeader ? { background: 'var(--warning-bg)', border: '1px solid var(--warning)' } : undefined}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE.md, marginBottom: SPACE.md }}>
        <div style={{ minWidth: 0 }}>
          <SectionHeader title="Challenge du mois" style={{ marginBottom: 4 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: FONT.bodyLg, fontWeight: WEIGHT.bold, color: isLeader ? 'var(--warning)' : 'var(--text)', letterSpacing: '-0.02em' }}>
            <Icon name="trophy" size={15} color={isLeader ? 'var(--warning)' : 'var(--text-2)'} />
            {mc.prize}
          </div>
          <div style={{ fontSize: FONT.label, color: 'var(--text-3)', marginTop: 3 }}>
            Jusqu&apos;au {endsLabel}
          </div>
        </div>
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '8px 12px', textAlign: 'center', flexShrink: 0,
          minWidth: 56,
        }}>
          <div style={{ fontSize: 22, fontWeight: WEIGHT.heavy, letterSpacing: '-0.03em', color: isLeader ? 'var(--warning)' : 'var(--text)', lineHeight: 1, display: 'flex', justifyContent: 'center' }}>
            {isLeader ? <Icon name="trophy" size={20} color="var(--warning)" /> : `#${lb.rank}`}
          </div>
          <div style={{ fontSize: FONT.micro, color: 'var(--text-3)', marginTop: 3 }}>/ {lb.total}</div>
        </div>
      </div>

      {/* Top 3 podium */}
      {top3.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: SPACE.sm }}>
          {top3.map((entry) => {
            const tone = rankTone(entry.rank);
            const max = top3[0]?.count ?? 1;
            const pct = max > 0 ? (entry.count / max) * 100 : 0;
            return (
              <div key={entry.rank} style={{
                display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: SPACE.sm, alignItems: 'center',
                padding: '6px 8px', borderRadius: 'var(--radius-sm)',
                background: entry.isYou ? 'var(--accent-muted)' : 'transparent',
                border: entry.isYou ? '1px solid var(--accent-border)' : '1px solid transparent',
              }}>
                <span style={{
                  width: 20, height: 20, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: FONT.micro + 1, fontWeight: WEIGHT.heavy,
                  background: tone.bg, color: tone.fg,
                }}>{entry.rank}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: FONT.body, fontWeight: WEIGHT.bold, color: entry.isYou ? 'var(--accent)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.firstName}
                  </div>
                  <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 999, marginTop: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: entry.rank === 1 ? 'var(--warning)' : 'var(--accent)', borderRadius: 999 }} />
                  </div>
                </div>
                <span style={{ fontSize: FONT.body, fontWeight: WEIGHT.heavy, color: 'var(--text)' }}>{entry.count}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: FONT.body - 1, color: 'var(--text-3)' }}>
        {isLeader
          ? `Vous êtes en tête (${monthCount} ventes) !`
          : gapToLeader === 0
            ? `Égalité avec le leader (${monthCount} ventes)`
            : `${gapToLeader} vente${gapToLeader !== 1 ? 's' : ''} de retard sur le #1`}
      </div>
    </Card>
  );
}
