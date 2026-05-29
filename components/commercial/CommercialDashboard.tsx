'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@/components/ambassadeur/icons';
import { CommercialContracts } from './CommercialContracts';

type AuthState = 'loading' | 'pin-required' | 'pin-setup' | 'pin-setup-invalid' | 'authenticated';
type TabId = 'ventes' | 'gains' | 'contrats' | 'compte';

interface StatsData {
  name: string;
  companyName: string;
  payoutsFrozen: boolean;
  allTimeSalesCount: number;
  weekCount: number;
  monthCount: number;
  soloCount: number;
  duoCount: number;
  totalCommission: number;
  weekCommission: number;
  monthCommission: number;
  grid: { soloCents: number; duoCents: number };
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
  companyName: string | null;
  vatNumber: string | null;
  vrpStatus: string | null;
  legalForm: string | null;
  pendingVerification: boolean;
  payoutsEnabled: boolean;
}

interface PayoutState {
  available: number;
  earnedTotal: number;
  paidOrPendingTotal: number;
  minPayoutCents: number;
  history: Array<{
    id: string;
    amount_cents: number;
    status: string;
    requested_at: string;
    paid_at: string | null;
    failure_reason?: string | null;
  }>;
}

interface StatementEntry {
  id: string;
  kind: 'commission' | 'payout';
  label: string;
  amountCents: number;
  date: string;
  status: 'pending' | 'paid' | 'failed' | null;
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'ventes',   label: 'Mes ventes' },
  { id: 'gains',    label: 'Mes gains' },
  { id: 'contrats', label: 'Contrats' },
  { id: 'compte',   label: 'Mon compte' },
];

const TOPBAR_H = 60;

function fmtEUR(cents: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
}

function fmtEUR2(cents: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const LEGAL_FORM_LABELS: Record<string, string> = {
  sarl: 'SARL', sas: 'SAS', sasu: 'SASU', ei: 'Entreprise individuelle',
  auto_entrepreneur: 'Auto-entrepreneur', eurl: 'EURL', sa: 'SA', autre: 'Autre',
};
const VRP_STATUS_LABELS: Record<string, string> = {
  vrp_exclusif: 'VRP exclusif',
  vrp_multicarte: 'VRP multicarte',
  agent_commercial: 'Agent commercial',
  independant: 'Commercial indépendant',
  autre: 'Autre',
};

// ── PIN input ──────────────────────────────────────────────────────────────
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
              textAlign: 'center', fontSize: 26, fontWeight: 700,
              background: 'var(--surface-2)',
              border: `2px solid ${d ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              color: 'var(--text)', outline: 'none', caretColor: 'transparent',
              transition: 'border-color 150ms',
            }}
          />
        ))}
      </div>
      {error && (
        <div style={{
          background: 'var(--error-bg)', color: 'var(--error)',
          borderRadius: 6, padding: '10px 14px',
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

// ── Banking panel ───────────────────────────────────────────────────────────
function BankingPanel({ code, banking, onChanged }: {
  code: string;
  banking: BankingState;
  onChanged: () => void;
}) {
  const [siret, setSiret] = useState(banking.siret ?? '');
  const [email, setEmail] = useState(banking.email ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function startOnboarding() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/commercial/${encodeURIComponent(code)}/banking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siret, email }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Erreur'); return; }
      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl;
      } else {
        onChanged();
      }
    } catch {
      setErr('Erreur réseau');
    } finally {
      setBusy(false);
    }
  }

  const verified = banking.onboardingStatus === 'verified' && banking.payoutsEnabled;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 20, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
          Compte bancaire Stripe Connect
        </div>
        {verified ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: 'var(--success-bg)', color: 'var(--success)' }}>
            <Icon name="check" size={11} strokeWidth={2.5} /> Vérifié
          </span>
        ) : banking.pendingVerification ? (
          <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: 'var(--warning-bg)', color: 'var(--warning)' }}>
            En vérification
          </span>
        ) : (
          <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: 'var(--surface-2)', color: 'var(--text-3)' }}>
            À configurer
          </span>
        )}
      </div>

      {verified ? (
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          Votre compte est vérifié et prêt à recevoir vos commissions. Les virements sont
          automatiques dès que vous demandez un retrait (minimum 30 €).
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 14 }}>
            Pour percevoir vos commissions, configurez votre compte Stripe Connect. Vous serez
            redirigé vers la procédure d&apos;onboarding sécurisée (identité, IBAN, conditions).
          </div>

          <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                SIRET (14 chiffres)
              </label>
              <input
                value={siret}
                onChange={e => setSiret(e.target.value)}
                placeholder="123 456 789 00012"
                inputMode="numeric"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box', outline: 'none',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                Email de contact Stripe
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="prenom.nom@exemple.fr"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box', outline: 'none',
                }}
              />
            </div>
          </div>

          {err && (
            <div style={{ fontSize: 13, color: 'var(--error)', padding: '8px 12px', background: 'var(--error-bg)', borderRadius: 6, marginBottom: 12 }}>{err}</div>
          )}

          <button
            onClick={startOnboarding}
            disabled={busy}
            style={{
              width: '100%', padding: '12px 18px', borderRadius: 10, border: 'none',
              background: 'var(--accent)', color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Préparation…' : banking.hasStripeAccount ? 'Reprendre l\'onboarding Stripe →' : 'Démarrer l\'onboarding Stripe →'}
          </button>
        </>
      )}
    </div>
  );
}

// ── Payout panel ────────────────────────────────────────────────────────────
function PayoutPanel({ code, payout, banking, onChanged }: {
  code: string;
  payout: PayoutState;
  banking: BankingState;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const ready = banking.onboardingStatus === 'verified' && banking.payoutsEnabled;
  const canWithdraw = ready && payout.available >= payout.minPayoutCents;

  async function requestPayout() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/commercial/${encodeURIComponent(code)}/payout`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMsg({ ok: true, text: `Virement de ${fmtEUR2(data.amount)} initié. Réception sous 1 à 3 jours ouvrés.` });
      } else {
        setMsg({ ok: false, text: data.error ?? 'Erreur' });
      }
      onChanged();
    } catch {
      setMsg({ ok: false, text: 'Erreur réseau' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 20, marginBottom: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
        Solde & versements
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
        <div style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Disponible
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.03em', marginTop: 4 }}>
            {fmtEUR(payout.available)}
          </div>
        </div>
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Cumul gagné
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
            {fmtEUR(payout.earnedTotal)}
          </div>
        </div>
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Déjà versé
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
            {fmtEUR(payout.paidOrPendingTotal)}
          </div>
        </div>
      </div>

      {msg && (
        <div style={{
          fontSize: 13, padding: '10px 12px', borderRadius: 7, marginBottom: 12,
          background: msg.ok ? 'var(--success-bg)' : 'var(--error-bg)',
          color: msg.ok ? 'var(--success)' : 'var(--error)',
        }}>
          {msg.text}
        </div>
      )}

      <button
        onClick={requestPayout}
        disabled={!canWithdraw || busy}
        style={{
          width: '100%', padding: '12px 18px', borderRadius: 10, border: 'none',
          background: canWithdraw ? 'var(--accent)' : 'var(--surface-2)',
          color: canWithdraw ? '#fff' : 'var(--text-3)',
          fontSize: 14, fontWeight: 700,
          cursor: canWithdraw && !busy ? 'pointer' : 'not-allowed',
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy
          ? 'Virement en cours…'
          : !ready
            ? 'Configurez Stripe Connect pour retirer'
            : payout.available < payout.minPayoutCents
              ? `Minimum ${fmtEUR(payout.minPayoutCents)} pour retirer`
              : `Demander un virement de ${fmtEUR(payout.available)} →`
        }
      </button>

      {payout.history.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Historique des virements
          </div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
            {payout.history.map((p, i) => (
              <div
                key={p.id}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr auto auto',
                  gap: 8, padding: '10px 12px', alignItems: 'center',
                  borderTop: i === 0 ? undefined : '1px solid var(--border-subtle)',
                  background: 'var(--surface)',
                }}
              >
                <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{fmtDateTime(p.paid_at ?? p.requested_at)}</div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                  background: p.status === 'paid' ? 'var(--success-bg)'
                    : p.status === 'failed' ? 'var(--error-bg)'
                    : 'var(--warning-bg)',
                  color: p.status === 'paid' ? 'var(--success)'
                    : p.status === 'failed' ? 'var(--error)'
                    : 'var(--warning)',
                }}>
                  {p.status === 'paid' ? 'Payé' : p.status === 'failed' ? 'Échec' : p.status === 'pending' ? 'En cours' : p.status}
                </span>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtEUR2(p.amount_cents)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Statement (chronological ledger) ───────────────────────────────────────
function StatementPanel({ code }: { code: string }) {
  const [entries, setEntries] = useState<StatementEntry[] | null>(null);
  const [available, setAvailable] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/commercial/${encodeURIComponent(code)}/statement`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.entries)) {
          setEntries(d.entries);
          setAvailable(d.available);
        }
      })
      .catch(() => {});
  }, [code]);

  useEffect(() => {
    if (open && entries === null) load();
  }, [open, entries, load]);

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 16,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '14px 20px', background: 'transparent', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Relevé chronologique</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Toutes vos commissions et virements, ligne par ligne
          </div>
        </div>
        <span style={{ fontSize: 18, color: 'var(--text-3)' }}>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {entries === null ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Chargement…</div>
          ) : entries.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Aucun mouvement.</div>
          ) : (
            <>
              <div style={{ padding: '10px 20px', background: 'var(--surface-2)', fontSize: 12, color: 'var(--text-3)' }}>
                Solde courant : <strong style={{ color: 'var(--text)' }}>{fmtEUR2(available)}</strong>
              </div>
              {entries.map((e, i) => (
                <div
                  key={e.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr auto',
                    gap: 8, padding: '10px 20px', alignItems: 'center',
                    borderTop: i === 0 ? undefined : '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{fmtDate(e.date)}</div>
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    color: e.amountCents >= 0 ? 'var(--success)' : 'var(--text-2)',
                  }}>
                    {e.amountCents >= 0 ? '+' : '−'}{fmtEUR2(Math.abs(e.amountCents))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Account info (read-only profile) ────────────────────────────────────────
function AccountPanel({ banking }: { banking: BankingState }) {
  const row = (label: string, value: React.ReactNode) => (
    <div style={{
      display: 'grid', gridTemplateColumns: '140px 1fr',
      padding: '10px 0', borderTop: '1px solid var(--border-subtle)',
      fontSize: 13, gap: 8,
    }}>
      <span style={{ color: 'var(--text-3)', textTransform: 'uppercase', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ color: 'var(--text)', wordBreak: 'break-word' }}>{value ?? <span style={{ color: 'var(--text-3)' }}>—</span>}</span>
    </div>
  );

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: '8px 20px 16px', marginBottom: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', padding: '12px 0 6px' }}>
        Informations professionnelles
      </div>
      {row('Société', banking.companyName)}
      {row('Forme juridique', banking.legalForm ? LEGAL_FORM_LABELS[banking.legalForm] ?? banking.legalForm : null)}
      {row('Statut commercial', banking.vrpStatus ? VRP_STATUS_LABELS[banking.vrpStatus] ?? banking.vrpStatus : null)}
      {row('SIRET', banking.siret ? <span style={{ fontFamily: 'monospace' }}>{banking.siret}</span> : null)}
      {row('N° TVA', banking.vatNumber ? <span style={{ fontFamily: 'monospace' }}>{banking.vatNumber}</span> : null)}
      {row('Email', banking.email)}
      {row('Téléphone', banking.phone)}
      {row('Ville', banking.city)}
      <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.55 }}>
        Pour mettre à jour ces informations, contactez{' '}
        <a href="mailto:partenaires@digitip.app" style={{ color: 'var(--accent)' }}>partenaires@digitip.app</a>.
      </div>
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────
export function CommercialDashboard({ code }: { code: string }) {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [commercialName, setCommercialName] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [banking, setBanking] = useState<BankingState | null>(null);
  const [payoutData, setPayoutData] = useState<PayoutState | null>(null);
  const [tab, setTab] = useState<TabId>(() => {
    if (typeof window === 'undefined') return 'ventes';
    const t = new URL(window.location.href).searchParams.get('tab');
    if (t === 'gains' || t === 'compte' || t === 'contrats') return t;
    if (t === 'banking' || t === 'payout') return 'gains';
    // ?download=<id> deep-link to a signed contract → open the contrats tab.
    if (new URL(window.location.href).searchParams.has('download')) return 'contrats';
    // Stripe Connect returns here after the hosted onboarding flow.
    const stripeFlag = new URL(window.location.href).searchParams.get('stripe');
    if (stripeFlag === 'return' || stripeFlag === 'refresh') return 'gains';
    return 'ventes';
  });
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const refreshBankingAndPayout = useCallback(() => {
    fetch(`/api/commercial/${encodeURIComponent(code)}/banking`)
      .then(r => r.json())
      .then(d => { if (!d.error) setBanking(d); })
      .catch(() => {});
    fetch(`/api/commercial/${encodeURIComponent(code)}/payout`)
      .then(r => r.json())
      .then(d => { if (!d.error) setPayoutData(d); })
      .catch(() => {});
  }, [code]);

  useEffect(() => {
    const url = typeof window !== 'undefined' ? new URL(window.location.href) : null;
    const tok = url?.searchParams.get('setup');

    if (tok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads window.location, unavailable during SSR
      setSetupToken(tok);
      fetch(`/api/commercial/${encodeURIComponent(code)}/set-pin?token=${encodeURIComponent(tok)}`)
        .then(r => r.json().then(d => ({ status: r.status, d })))
        .then(({ status, d }) => {
          if (status === 200 && d.valid) {
            setCommercialName(d.name ?? '');
            setAuthState('pin-setup');
          } else {
            setSetupError(d.error ?? 'Lien invalide');
            setAuthState('pin-setup-invalid');
          }
        })
        .catch(() => { setSetupError('Erreur réseau'); setAuthState('pin-setup-invalid'); });
      return;
    }

    fetch(`/api/commercial/${encodeURIComponent(code)}/auth`)
      .then(r => r.json())
      .then(data => {
        if (data.authenticated) {
          setCommercialName(data.name ?? '');
          setAuthState('authenticated');
        } else {
          setAuthState('pin-required');
        }
      })
      .catch(() => setAuthState('pin-required'));
  }, [code]);

  const handleSetupPin = useCallback(async (pin: string) => {
    if (!setupToken) return;
    setPinLoading(true); setPinError(null);
    try {
      const res = await fetch(`/api/commercial/${encodeURIComponent(code)}/set-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, token: setupToken }),
      });
      const data = await res.json();
      if (!res.ok) { setPinError(data.error ?? 'Échec de la configuration'); return; }
      if (typeof window !== 'undefined') {
        const u = new URL(window.location.href);
        u.searchParams.delete('setup');
        window.history.replaceState({}, '', u.pathname + (u.search ? '?' + u.searchParams.toString() : ''));
      }
      setCommercialName(data.name ?? '');
      setAuthState('authenticated');
    } catch {
      setPinError('Erreur réseau. Réessayez.');
    } finally {
      setPinLoading(false);
    }
  }, [code, setupToken]);

  useEffect(() => {
    if (authState !== 'authenticated') return;
    fetch(`/api/commercial/${encodeURIComponent(code)}/stats`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setStatsError(data.error); return; }
        setStats(data);
        setCommercialName(prev => data.name?.split(' ')[0] ?? prev);
      })
      .catch(() => setStatsError('Impossible de charger les statistiques.'));
    refreshBankingAndPayout();
  }, [authState, code, refreshBankingAndPayout]);

  const handlePin = useCallback(async (pin: string) => {
    setPinLoading(true); setPinError(null);
    try {
      const res = await fetch(`/api/commercial/${encodeURIComponent(code)}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (res.status === 429) setPinError(data.error ?? 'Trop de tentatives. Réessayez dans 15 min.');
      else if (!res.ok) setPinError(data.error ?? 'PIN incorrect.');
      else {
        setCommercialName(data.name ?? '');
        setAuthState('authenticated');
      }
    } catch { setPinError('Erreur réseau. Réessayez.'); }
    finally { setPinLoading(false); }
  }, [code]);

  async function handleLogout() {
    try {
      await fetch(`/api/commercial/${encodeURIComponent(code)}/logout`, { method: 'POST' });
    } catch { /* ignore */ }
    setStats(null); setBanking(null); setPayoutData(null);
    setAuthState('pin-required');
  }

  // ── Loading ──────────────────────────────────────────────────────────────
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

  // ── PIN setup (first connection via admin link) ──────────────────────────
  if (authState === 'pin-setup') {
    return (
      <div style={{
        minHeight: '100dvh', background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 20px', fontFamily: 'var(--font)',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 6 }}>
              Digitip
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Espace Commercial · {code.toUpperCase()}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '28px 24px' }}>
            <div style={{ textAlign: 'center', marginBottom: 22 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                Bienvenue {commercialName}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
                Choisissez votre <strong>PIN à 4 chiffres</strong>. Vous l&apos;utiliserez à chaque
                connexion à votre espace commercial — conservez-le en sécurité.
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
        <div style={{ maxWidth: 380, textAlign: 'center', padding: 28, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <Icon name="alert" size={30} color="var(--warning)" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            Lien d&apos;activation invalide
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
            {setupError ?? "Ce lien n'est plus valable."} Contactez Digitip pour en recevoir un nouveau :{' '}
            <a href="mailto:partenaires@digitip.app" style={{ color: 'var(--accent)' }}>partenaires@digitip.app</a>.
          </div>
        </div>
      </div>
    );
  }

  // ── PIN required ─────────────────────────────────────────────────────────
  if (authState === 'pin-required') {
    return (
      <div style={{
        minHeight: '100dvh', background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 20px', fontFamily: 'var(--font)',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 6 }}>
              Digitip
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Espace Commercial · {code.toUpperCase()}
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '28px 24px' }}>
            <div style={{ textAlign: 'center', marginBottom: 22 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                Votre PIN à 4 chiffres
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                Pour accéder à votre tableau de bord
              </div>
            </div>
            <PinInput onSubmit={handlePin} error={pinError} loading={pinLoading} />
          </div>
        </div>
      </div>
    );
  }

  // ── Authenticated — stats loading ────────────────────────────────────────
  if (!stats) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)' }}>
        {statsError
          ? <div style={{ color: 'var(--error)', fontSize: 14, padding: '0 20px', textAlign: 'center' }}>{statsError}</div>
          : <div style={{ color: 'var(--text-3)', fontSize: 14 }}>Chargement…</div>}
      </div>
    );
  }

  // ── Dashboard ────────────────────────────────────────────────────────────
  const firstName = commercialName.split(' ')[0];

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      {/* Top bar — dark institutional accent */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        height: TOPBAR_H,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Espace Commercial Pro · {code.toUpperCase()}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.2, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {firstName} · {stats.companyName}
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-3)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          Déconnexion
        </button>
      </div>

      {/* Frozen banner */}
      {stats.payoutsFrozen && (
        <div style={{ background: 'var(--warning-bg)', color: 'var(--warning)', padding: '10px 16px', fontSize: 12.5, textAlign: 'center', borderBottom: '1px solid var(--warning)' }}>
          <Icon name="pause" size={13} style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 4 }} /> Vos virements sont temporairement gelés. Contactez{' '}
          <a href="mailto:partenaires@digitip.app" style={{ color: 'var(--warning)', fontWeight: 700 }}>partenaires@digitip.app</a>.
        </div>
      )}

      {/* Content */}
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '20px 16px 48px' }}>
        {/* Hero — institutional stat block */}
        <div style={{
          background: 'linear-gradient(135deg, var(--accent-muted) 0%, var(--surface) 100%)',
          border: '1px solid var(--accent-border)',
          borderRadius: 'var(--radius-xl)',
          padding: '20px 22px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Bilan global
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {fmtEUR(stats.totalCommission)}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
                Commissions cumulées · {stats.allTimeSalesCount} vente{stats.allTimeSalesCount !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
                {stats.soloCount} Solo · {stats.duoCount} Duo
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                Barème {fmtEUR(stats.grid.soloCents)} / {fmtEUR(stats.grid.duoCents)}
              </div>
            </div>
          </div>
        </div>

        {/* This month / this week */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Cette semaine
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>
              {fmtEUR(stats.weekCommission)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
              {stats.weekCount} vente{stats.weekCount !== 1 ? 's' : ''}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Ce mois
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>
              {fmtEUR(stats.monthCommission)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
              {stats.monthCount} vente{stats.monthCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          position: 'sticky', top: TOPBAR_H, zIndex: 9,
          display: 'flex', gap: 4,
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: 16,
        }}>
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
                  fontSize: 13, fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {tab === 'ventes' && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius)', overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Dernières ventes</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Code <code style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{code.toUpperCase()}</code>
              </div>
            </div>
            {stats.recentSales.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                Aucune vente pour le moment.<br/>
                Présentez votre code <strong>{code.toUpperCase()}</strong> à un commerce pour récolter votre première commission.
              </div>
            ) : (
              stats.recentSales.map((s, idx) => (
                <div key={s.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto auto',
                  gap: 8, padding: '12px 16px', alignItems: 'center',
                  borderBottom: idx < stats.recentSales.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtDate(s.created_at)}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.salon_name_partial ?? '***'}
                    </div>
                  </div>
                  <span style={{
                    padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                    background: s.pack === 'duo' ? 'var(--accent-muted)' : 'var(--success-bg)',
                    color: s.pack === 'duo' ? 'var(--accent)' : 'var(--success)',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{s.pack}</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    +{fmtEUR(s.commission_amount)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'gains' && (
          <>
            {banking && (
              <BankingPanel code={code} banking={banking} onChanged={refreshBankingAndPayout} />
            )}
            {banking && payoutData && (
              <PayoutPanel code={code} payout={payoutData} banking={banking} onChanged={refreshBankingAndPayout} />
            )}
            <StatementPanel code={code} />
          </>
        )}

        {tab === 'contrats' && (
          <CommercialContracts code={code} />
        )}

        {tab === 'compte' && banking && (
          <AccountPanel banking={banking} />
        )}
      </div>
    </div>
  );
}
