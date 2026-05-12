'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AmbassadeurPayoutPanel } from './AmbassadeurBanking';
import { AmbassadeurContracts } from './AmbassadeurContracts';
import { AmbassadeurReferralPanel } from './AmbassadeurReferralPanel';

type AuthState = 'loading' | 'pin-required' | 'pin-setup' | 'pin-setup-invalid' | 'authenticated';

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
  monthlyBonusUnlocked: boolean;
  monthlyChallenge: { threshold: number; bonus: number; prize: string };
  tiers: TierInfo[];
  leaderboard: {
    rank: number;
    total: number;
    top3: Array<{ rank: number; firstName: string; count: number; isYou: boolean }>;
  };
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
}

interface PayoutState {
  available: number;
  earnedTotal: number;
  paidOrPendingTotal: number;
  minPayoutCents: number;
  history: Array<{ id: string; amount_cents: number; status: string; requested_at: string; paid_at: string | null }>;
}

// Maps tier id → DigiTip CSS variables
const TIER_VARS: Record<string, { color: string; bg: string; border: string }> = {
  gold:   { color: 'var(--warning)',  bg: 'var(--warning-bg)',  border: 'var(--warning)' },
  silver: { color: 'var(--neutral)',  bg: 'var(--neutral-bg)',  border: 'var(--neutral)' },
  bronze: { color: 'var(--accent)',   bg: 'var(--accent-muted)', border: 'var(--accent-border)' },
};

function fmtEuros(cents: number) {
  return `${Math.round(cents / 100)}€`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div style={{ height: 6, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        background: color,
        borderRadius: 99,
        transition: 'width 0.8s cubic-bezier(0.34,1.56,0.64,1)',
      }} />
    </div>
  );
}

function TierCard({ tier, weekCount }: { tier: TierInfo; weekCount: number }) {
  const vars = TIER_VARS[tier.id] ?? TIER_VARS.bronze;
  const remaining = Math.max(0, tier.threshold - weekCount);

  return (
    <div style={{
      background: tier.unlocked ? vars.bg : 'var(--surface)',
      border: `1px solid ${tier.unlocked ? vars.border : 'var(--border-subtle)'}`,
      borderRadius: 'var(--radius)',
      padding: '14px 10px',
      flex: 1,
      minWidth: 0,
      transition: 'all 200ms',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>{tier.emoji}</span>
        {tier.unlocked && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
            color: vars.color, background: vars.bg,
            border: `1px solid ${vars.border}`,
            padding: '2px 6px', borderRadius: 99,
          }}>✓</span>
        )}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: tier.unlocked ? vars.color : 'var(--text-3)', marginBottom: 2, letterSpacing: '-0.01em' }}>
        {tier.label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.03em', color: tier.unlocked ? vars.color : 'var(--text)', marginBottom: 8 }}>
        +{fmtEuros(tier.bonus)}
      </div>
      <ProgressBar value={weekCount} max={tier.threshold} color={tier.unlocked ? vars.color : 'var(--border)'} />
      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between', gap: 4 }}>
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
          fontSize: 13, fontWeight: 500, textAlign: 'center', marginBottom: 16,
        }}>
          {error}
        </div>
      )}
      {loading && (
        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
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
      setPinError('Erreur réseau. Réessaie.');
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
        setPinError(data.error ?? 'Trop de tentatives. Réessaie dans 15 min.');
      } else if (!res.ok) {
        setPinError(data.error ?? 'PIN incorrect.');
      } else {
        setAmbassadorName(data.name ?? '');
        setAuthState('authenticated');
      }
    } catch {
      setPinError('Erreur réseau. Réessaie.');
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
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Première connexion · {code.toUpperCase()}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '28px 24px' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                Bienvenue {ambassadorName} 👋
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>
                Choisis ton <strong>PIN à 4 chiffres</strong>. Tu l&apos;utiliseras à chaque connexion — note-le quelque part.
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
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            Lien d&apos;activation invalide
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>
            {setupError ?? 'Ce lien n\'est plus valable.'} Contacte Digitip pour en recevoir un nouveau.
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
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
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
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                Ton PIN à 4 chiffres
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                Pour accéder à ton dashboard
              </div>
            </div>

            <PinInput onSubmit={handlePin} error={pinError} loading={pinLoading} />

            <button
              onClick={() => {/* auto-submitted via PinInput */}}
              disabled
              style={{
                display: 'none', // bouton caché, auto-submit au 4e chiffre
              }}
            />
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
  const { weekCount, monthCount, totalBaseCommission, weeklyBonusCents,
    tiers, leaderboard, recentSales } = stats;

  const rankLabel = leaderboard.rank === 1 ? '🏆' : `#${leaderboard.rank}`;
  const firstName = ambassadorName.split(' ')[0];
  const top3 = leaderboard.top3 ?? [];
  const leader = top3[0];
  const gapToLeader = leader && !leader.isYou ? Math.max(0, leader.count - monthCount) : 0;

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>

      {/* Top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Ambassadeur · {code.toUpperCase()}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', lineHeight: 1.2, marginTop: 1 }}>
            Bonjour {firstName} 👋
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {/* Cette semaine */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              Cette semaine
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1 }}>
              {weekCount}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
              vente{weekCount !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Commissions */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              Commissions
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.04em', lineHeight: 1 }}>
              {fmtEuros(totalBaseCommission)}
            </div>
            {weeklyBonusCents > 0 ? (
              <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 4, fontWeight: 600 }}>
                +{fmtEuros(weeklyBonusCents)} bonus
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                {stats.allTimeSalesCount} vente{stats.allTimeSalesCount !== 1 ? 's' : ''} total
              </div>
            )}
          </div>
        </div>

        {/* Paiement note */}
        <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginBottom: 20 }}>
          Paiement chaque vendredi · {stats.allTimeSalesCount} vente{stats.allTimeSalesCount !== 1 ? 's' : ''} au total
        </div>

        {/* Paliers de la semaine */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
            Paliers de la semaine
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic', marginBottom: 10 }}>
            Un seul bonus — le palier le plus élevé atteint
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {tiers.map(tier => (
              <TierCard key={tier.id} tier={tier} weekCount={weekCount} />
            ))}
          </div>
        </div>

        {/* Parrainage */}
        <AmbassadeurReferralPanel code={code} />

        {/* Contrats à signer / signés */}
        <AmbassadeurContracts code={code} />

        {/* Virements */}
        {banking && (
          <AmbassadeurPayoutPanel
            code={code}
            banking={banking}
            payout={payoutData}
            onChanged={refreshBankingAndPayout}
          />
        )}

        {/* Leaderboard du mois */}
        <div style={{
          background: leaderboard.rank === 1 ? 'var(--warning-bg)' : 'var(--surface)',
          border: `1px solid ${leaderboard.rank === 1 ? 'var(--warning)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--radius)',
          padding: 18,
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                Classement du mois
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: leaderboard.rank === 1 ? 'var(--warning)' : 'var(--text)', letterSpacing: '-0.02em' }}>
                🏆 {stats.monthlyChallenge.prize}
              </div>
            </div>
            <div style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '8px 12px', textAlign: 'center', flexShrink: 0,
            }}>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', color: leaderboard.rank === 1 ? 'var(--warning)' : 'var(--text)', lineHeight: 1 }}>
                {rankLabel}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>/ {leaderboard.total}</div>
            </div>
          </div>

          {/* Top 3 podium */}
          {top3.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {top3.map((entry) => {
                const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉';
                const max = top3[0]?.count ?? 1;
                const pct = max > 0 ? (entry.count / max) * 100 : 0;
                return (
                  <div key={entry.rank} style={{
                    display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 8, alignItems: 'center',
                    padding: '6px 8px', borderRadius: 8,
                    background: entry.isYou ? 'var(--accent-muted)' : 'transparent',
                    border: entry.isYou ? '1px solid var(--accent-border)' : '1px solid transparent',
                  }}>
                    <span style={{ fontSize: 14 }}>{medal}</span>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: entry.isYou ? 'var(--accent)' : 'var(--text-2)' }}>
                        {entry.firstName}
                      </div>
                      <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 99, marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: entry.rank === 1 ? 'var(--warning)' : 'var(--accent)', borderRadius: 99 }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{entry.count}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: 'var(--text-3)' }}>
              {leaderboard.rank === 1
                ? `🔥 Tu es en tête (${monthCount} ventes) !`
                : gapToLeader === 0
                  ? `Égalité avec le leader (${monthCount} ventes)`
                  : `${gapToLeader} vente${gapToLeader !== 1 ? 's' : ''} de retard sur le #1`}
            </span>
          </div>
        </div>

        {/* Dernières ventes */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
            textTransform: 'uppercase', letterSpacing: '0.07em',
          }}>
            Dernières ventes
          </div>

          {recentSales.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              Aucune vente pour l&apos;instant. Continue ! 💪
            </div>
          ) : (
            recentSales.map((sale, idx) => (
              <div key={sale.id} style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto',
                gap: 10, padding: '12px 16px', alignItems: 'center',
                borderBottom: idx < recentSales.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtDate(sale.created_at)}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginTop: 1 }}>
                    {sale.salon_name_partial ?? '***'}
                  </div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  background: sale.pack === 'duo' ? 'var(--accent-muted)' : 'var(--success-bg)',
                  color: sale.pack === 'duo' ? 'var(--accent)' : 'var(--success)',
                  border: `1px solid ${sale.pack === 'duo' ? 'var(--accent-border)' : 'var(--success)'}`,
                  whiteSpace: 'nowrap',
                }}>
                  {sale.pack}
                </span>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  +{fmtEuros(sale.commission_amount)}
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
