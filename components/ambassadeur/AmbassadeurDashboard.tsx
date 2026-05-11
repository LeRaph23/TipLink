'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type AuthState = 'loading' | 'pin-required' | 'authenticated';

interface TierInfo {
  id: string;
  label: string;
  emoji: string;
  color: string;
  bg: string;
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
  weeklyTier: { id: string; label: string; bonus: number } | null;
  weeklyBonusCents: number;
  monthlyBonusUnlocked: boolean;
  monthlyChallenge: { threshold: number; bonus: number; prize: string };
  tiers: TierInfo[];
  leaderboard: { rank: number; total: number };
  recentSales: Array<{
    id: string;
    pack: string;
    commission_amount: number;
    salon_name_partial: string | null;
    created_at: string;
  }>;
}

function fmtEuros(cents: number) {
  return `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€`;
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div style={{
      height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.1)',
      overflow: 'hidden', position: 'relative',
    }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${pct}%`,
        background: color,
        borderRadius: 99,
        transition: 'width 0.8s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: pct > 0 ? `0 0 8px ${color}88` : 'none',
      }} />
    </div>
  );
}

function TierCard({ tier, weekCount }: { tier: TierInfo; weekCount: number }) {
  const remaining = Math.max(0, tier.threshold - weekCount);
  return (
    <div style={{
      background: tier.unlocked ? tier.bg : 'rgba(255,255,255,0.04)',
      border: `1px solid ${tier.unlocked ? tier.color + '60' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 16, padding: '18px 16px', flex: 1,
      transition: 'all 0.3s ease',
      boxShadow: tier.unlocked ? `0 0 20px ${tier.bg}` : 'none',
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 22 }}>{tier.emoji}</span>
        {tier.unlocked && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: tier.color,
            background: tier.bg, padding: '2px 8px', borderRadius: 99,
            border: `1px solid ${tier.color}40`, letterSpacing: '0.05em',
          }}>DÉBLOQUÉ</span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: tier.unlocked ? tier.color : 'rgba(255,255,255,0.5)', marginBottom: 2 }}>
        {tier.label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'white', letterSpacing: '-0.03em', marginBottom: 10 }}>
        +{fmtEuros(tier.bonus)}
      </div>
      <ProgressBar value={weekCount} max={tier.threshold} color={tier.color} />
      <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.45)', display: 'flex', justifyContent: 'space-between' }}>
        <span>{Math.min(weekCount, tier.threshold)} / {tier.threshold} ventes</span>
        {!tier.unlocked && <span>{remaining} restante{remaining > 1 ? 's' : ''}</span>}
      </div>
    </div>
  );
}

// PIN input: 4 separate digit boxes
function PinInput({ onSubmit, error, loading }: {
  onSubmit: (pin: string) => void;
  error: string | null;
  loading: boolean;
}) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  useEffect(() => { refs[0].current?.focus(); }, []);

  const handleChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = digit;
    setDigits(next);
    if (digit && i < 3) refs[i + 1].current?.focus();
    if (next.every(d => d !== '')) {
      onSubmit(next.join(''));
    }
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs[i - 1].current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 4) {
      const next = pasted.split('');
      setDigits(next);
      refs[3].current?.focus();
      onSubmit(pasted);
    }
    e.preventDefault();
  };

  const digitStyle = (filled: boolean): React.CSSProperties => ({
    width: 56, height: 64, borderRadius: 12, border: `2px solid ${filled ? 'rgba(167,139,250,0.8)' : 'rgba(255,255,255,0.15)'}`,
    background: filled ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.05)',
    color: 'white', fontSize: 28, fontWeight: 700, textAlign: 'center',
    outline: 'none', transition: 'all 0.15s ease',
    caretColor: 'transparent',
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={refs[i]}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            style={digitStyle(d !== '')}
            disabled={loading}
          />
        ))}
      </div>
      {error && (
        <div style={{
          color: '#f87171', fontSize: 13, textAlign: 'center', marginBottom: 16,
          padding: '8px 16px', background: 'rgba(248,113,113,0.1)',
          borderRadius: 8, border: '1px solid rgba(248,113,113,0.2)',
        }}>
          {error}
        </div>
      )}
      {loading && (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
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

  // Check existing session on mount
  useEffect(() => {
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

  // Fetch stats when authenticated
  useEffect(() => {
    if (authState !== 'authenticated') return;
    fetch(`/api/ambassadeur/${encodeURIComponent(code)}/stats`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setStatsError(data.error); return; }
        setStats(data);
        setAmbassadorName(data.name?.split(' ')[0] ?? ambassadorName);
      })
      .catch(() => setStatsError('Impossible de charger les stats.'));
  }, [authState, code]);

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
        setPinError(data.error ?? 'PIN incorrect');
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

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 50%, #0f0c29 100%)',
    color: 'white',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (authState === 'loading') {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Chargement…</div>
      </div>
    );
  }

  // ── PIN required ─────────────────────────────────────────────────────────────
  if (authState === 'pin-required') {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>
              Dashboard Ambassadeur
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 8, margin: '8px 0 0' }}>
              Entre ton code PIN à 4 chiffres
            </p>
            <p style={{ color: 'rgba(167,139,250,0.8)', fontSize: 13, fontWeight: 600, marginTop: 4 }}>
              {code.toUpperCase()}
            </p>
          </div>
          <PinInput onSubmit={handlePin} error={pinError} loading={pinLoading} />
        </div>
      </div>
    );
  }

  // ── Authenticated — no stats yet ──────────────────────────────────────────────
  if (!stats) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {statsError
          ? <div style={{ color: '#f87171', fontSize: 14 }}>{statsError}</div>
          : <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Chargement des stats…</div>}
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────────
  const { weekCount, monthCount, totalBaseCommission, weeklyBonusCents,
          monthlyBonusUnlocked, monthlyChallenge, tiers, leaderboard, recentSales } = stats;

  const monthlyRemaining = Math.max(0, monthlyChallenge.threshold - monthCount);
  const monthlyPct = Math.min(100, (monthCount / monthlyChallenge.threshold) * 100);

  const rankEmoji = leaderboard.rank === 1 ? '🏆' : leaderboard.rank === 2 ? '🥈' : leaderboard.rank === 3 ? '🥉' : '🎯';

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 60px' }}>

        {/* ── Hero ── */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(167,139,250,0.2) 0%, rgba(236,72,153,0.15) 100%)',
          border: '1px solid rgba(167,139,250,0.2)',
          borderRadius: 20, padding: '28px 24px', marginBottom: 20, marginTop: 20,
        }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 4px' }}>
            Dashboard Ambassadeur · {code.toUpperCase()}
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 20px', letterSpacing: '-0.03em' }}>
            Bonjour {ambassadorName} 👋
          </h1>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{
              background: 'rgba(255,255,255,0.06)', borderRadius: 14,
              padding: '16px', border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Cette semaine
              </div>
              <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1 }}>
                {weekCount}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                vente{weekCount > 1 ? 's' : ''}
              </div>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.06)', borderRadius: 14,
              padding: '16px', border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Commissions dues
              </div>
              <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, color: '#a78bfa' }}>
                {fmtEuros(totalBaseCommission)}
              </div>
              {weeklyBonusCents > 0 && (
                <div style={{ fontSize: 12, color: '#4ade80', marginTop: 4, fontWeight: 600 }}>
                  + {fmtEuros(weeklyBonusCents)} bonus semaine
                </div>
              )}
            </div>
          </div>
          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
            {stats.allTimeSalesCount} vente{stats.allTimeSalesCount > 1 ? 's' : ''} au total · paiement chaque vendredi
          </div>
        </div>

        {/* ── Weekly tiers ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Paliers de la semaine
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 12, fontStyle: 'italic' }}>
            Un seul bonus par semaine — le palier le plus élevé atteint
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {tiers.map((tier) => (
              <TierCard key={tier.id} tier={tier} weekCount={weekCount} />
            ))}
          </div>
        </div>

        {/* ── Monthly challenge ── */}
        <div style={{
          background: monthlyBonusUnlocked
            ? 'linear-gradient(135deg, rgba(250,204,21,0.15), rgba(234,179,8,0.08))'
            : 'rgba(255,255,255,0.04)',
          border: `1px solid ${monthlyBonusUnlocked ? 'rgba(250,204,21,0.4)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 20, padding: '20px', marginBottom: 20,
          boxShadow: monthlyBonusUnlocked ? '0 0 30px rgba(250,204,21,0.1)' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Challenge du Mois
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>
                {monthlyBonusUnlocked ? '🎉 BONUS 200€ DÉBLOQUÉ !' : `🏆 ${monthlyChallenge.prize}`}
              </div>
            </div>
            <div style={{
              background: monthlyBonusUnlocked ? 'rgba(250,204,21,0.2)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${monthlyBonusUnlocked ? 'rgba(250,204,21,0.4)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 12, padding: '8px 14px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', color: monthlyBonusUnlocked ? '#fde047' : 'white' }}>
                {monthCount}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>/ {monthlyChallenge.threshold}</div>
            </div>
          </div>
          <ProgressBar value={monthCount} max={monthlyChallenge.threshold} color={monthlyBonusUnlocked ? '#fde047' : '#a78bfa'} />
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>
              {monthlyBonusUnlocked ? 'Objectif atteint !' : `Plus que ${monthlyRemaining} vente${monthlyRemaining > 1 ? 's' : ''} !`}
            </span>
            <span style={{
              color: rankEmoji === '🏆' ? '#fde047' : 'rgba(255,255,255,0.5)',
              fontWeight: 700,
            }}>
              {rankEmoji} #{leaderboard.rank} sur {leaderboard.total} ambassadeur{leaderboard.total > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ── Recent sales ── */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, overflow: 'hidden',
        }}>
          <div style={{
            padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
            textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            Dernières ventes
          </div>
          {recentSales.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
              Aucune vente pour l&apos;instant. Continue ! 💪
            </div>
          ) : (
            <div>
              {recentSales.map((sale) => (
                <div key={sale.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto auto',
                  gap: 12, padding: '12px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                      {new Date(sale.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
                      {sale.salon_name_partial ?? '***'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 99,
                    background: sale.pack === 'duo' ? 'rgba(167,139,250,0.15)' : 'rgba(96,165,250,0.15)',
                    color: sale.pack === 'duo' ? '#a78bfa' : '#60a5fa',
                    border: `1px solid ${sale.pack === 'duo' ? 'rgba(167,139,250,0.3)' : 'rgba(96,165,250,0.3)'}`,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {sale.pack}
                  </span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80', textAlign: 'right' }}>
                    +{fmtEuros(sale.commission_amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
