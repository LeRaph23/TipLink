'use client';

import { useState } from 'react';

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 13.5, boxSizing: 'border-box', outline: 'none',
};
const label: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block',
};

interface FormProps {
  code: string;
  defaults?: { email?: string | null; siret?: string | null };
}

// Collects only the SIRET (a TipLink requirement — ambassadors are
// self-employed) and a contact email. Identity, IBAN and terms are gathered by
// Stripe's hosted onboarding, to which we redirect on submit.
export function AmbassadeurBankingForm({ code, defaults }: FormProps) {
  const [siret, setSiret] = useState(defaults?.siret ?? '');
  const [email, setEmail] = useState(defaults?.email ?? '');
  const [pledge, setPledge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (!/^\d{14}$/.test(siret.replace(/\s+/g, ''))) {
      setError("SIRET invalide. Pas encore de SIRET ? Crée-le gratuitement sur autoentrepreneur.urssaf.fr.");
      return;
    }
    if (!email.trim()) { setError('Email requis.'); return; }
    if (!pledge) { setError("Tu dois accepter l'engagement de non-fraude."); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/banking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siret: siret.replace(/\s+/g, ''), email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.onboardingUrl) {
        setError(data.error ?? 'Erreur.');
        setSubmitting(false);
        return;
      }
      // Redirect to Stripe's hosted onboarding. The page navigates away, so we
      // intentionally leave `submitting` true.
      window.location.href = data.onboardingUrl;
    } catch {
      setError('Erreur réseau.');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
        borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45,
      }}>
        🔒 <strong>Paiements sécurisés par Stripe.</strong> Tu vas être redirigé vers
        Stripe, notre partenaire de paiement, pour saisir ton IBAN et vérifier ton
        identité. Digitip ne voit jamais tes informations bancaires.
      </div>

      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45,
      }}>
        <strong>SIRET obligatoire</strong> pour recevoir tes virements.{' '}
        Pas encore de SIRET ? Crée-le gratuitement sur{' '}
        <a href="https://autoentrepreneur.urssaf.fr" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          autoentrepreneur.urssaf.fr
        </a>.
      </div>

      {error && (
        <div style={{ fontSize: 12.5, color: 'var(--error)', padding: '10px 14px', background: 'var(--error-bg)', borderRadius: 8 }}>
          {error}
        </div>
      )}

      <div>
        <span style={label}>SIRET (14 chiffres)</span>
        <input style={inp} value={siret} onChange={e => setSiret(e.target.value)} placeholder="12345678901234" inputMode="numeric" />
      </div>

      <div>
        <span style={label}>Email</span>
        <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@email.com" />
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={pledge} onChange={e => setPledge(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Je m&apos;engage à ne pas frauder (pas de fausses ventes, pas de codes promo utilisés sur mes propres commandes).
        </span>
      </label>

      <button
        onClick={submit}
        disabled={submitting}
        style={{
          padding: '12px 20px', borderRadius: 10, border: 'none',
          background: 'var(--accent)', color: '#fff', fontSize: 13.5, fontWeight: 700,
          cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? 'Redirection vers Stripe…' : 'Configurer mes virements →'}
      </button>
    </div>
  );
}

export function AmbassadeurPayoutPanel({
  code,
  banking,
  payout,
  onChanged,
}: {
  code: string;
  banking: BankingPanelData;
  payout: PayoutData | null;
  onChanged: () => void;
}) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fmt = (cents: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

  async function handlePayout() {
    if (!payout) return;
    setError(null);
    setSuccessMsg(null);
    setRequesting(true);
    try {
      const res = await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/payout`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erreur.'); return; }
      if (data.status === 'paid') {
        setSuccessMsg(`Virement de ${fmt(data.amount)} envoyé ! Arrivée sous 1-2 jours ouvrés.`);
      } else {
        setSuccessMsg(`Demande de ${fmt(data.amount)} enregistrée. ${data.note ?? "Validation par l'administrateur."}`);
      }
      onChanged();
    } catch {
      setError('Erreur réseau.');
    } finally {
      setRequesting(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius)', padding: 18, marginBottom: 16,
  };
  const headerStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
    textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8,
  };

  // No connected account yet, or one exists but Stripe onboarding is unfinished
  // (payouts not yet enabled) — both states route the ambassador to Stripe.
  if (!banking.hasStripeAccount || !banking.payoutsEnabled) {
    const pending = banking.hasStripeAccount;
    return (
      <div style={cardStyle}>
        <div style={headerStyle}>💰 Virements</div>
        {!setupOpen ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
              {pending
                ? "Ta configuration Stripe n'est pas encore terminée. Reprends-la pour pouvoir recevoir tes commissions."
                : 'Configure ton compte pour recevoir tes commissions par virement bancaire.'}
            </div>
            <button
              onClick={() => setSetupOpen(true)}
              style={{
                padding: '10px 18px', borderRadius: 10, border: 'none',
                background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {pending ? 'Reprendre la configuration →' : 'Configurer mon compte bancaire →'}
            </button>
          </>
        ) : (
          <AmbassadeurBankingForm
            code={code}
            defaults={{ email: banking.email, siret: banking.siret }}
          />
        )}
      </div>
    );
  }

  // Banking is configured — show available balance + payout button
  const available = payout?.available ?? 0;
  const minCents = payout?.minPayoutCents ?? 3000;
  const canPayout = available >= minCents;

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>💰 Virements</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Solde disponible</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1 }}>
            {fmt(available)}
          </div>
        </div>
        {payout && payout.paidOrPendingTotal > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>
            Déjà versé : {fmt(payout.paidOrPendingTotal)}
          </div>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 12.5, color: 'var(--error)', padding: '8px 12px', background: 'var(--error-bg)', borderRadius: 8, marginBottom: 10 }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div style={{ fontSize: 12.5, color: 'var(--success)', padding: '8px 12px', background: 'var(--success-bg)', borderRadius: 8, marginBottom: 10 }}>
          {successMsg}
        </div>
      )}

      <button
        onClick={handlePayout}
        disabled={!canPayout || requesting}
        style={{
          width: '100%', padding: '11px 20px', borderRadius: 10, border: 'none',
          background: canPayout ? 'var(--accent)' : 'var(--surface-3)',
          color: canPayout ? '#fff' : 'var(--text-3)',
          fontSize: 13.5, fontWeight: 700,
          cursor: canPayout && !requesting ? 'pointer' : 'not-allowed',
          opacity: requesting ? 0.7 : 1,
        }}
      >
        {requesting ? 'Demande en cours…' : `Virer ${fmt(available)} sur mon IBAN →`}
      </button>

      {!canPayout && (
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8, textAlign: 'center' }}>
          Minimum {fmt(minCents)} — il te manque {fmt(minCents - available)}.
        </div>
      )}

      {payout && payout.history.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            Historique
          </div>
          {payout.history.slice(0, 5).map((h) => (
            <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 12 }}>
              <span style={{ color: 'var(--text-3)' }}>
                {new Date(h.requested_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              </span>
              <span style={{ fontWeight: 600 }}>{fmt(h.amount_cents)}</span>
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 99,
                background: h.status === 'paid' ? 'var(--success-bg)' : h.status === 'pending' ? 'var(--warning-bg)' : 'var(--error-bg)',
                color: h.status === 'paid' ? 'var(--success)' : h.status === 'pending' ? 'var(--warning)' : 'var(--error)',
                fontWeight: 600,
              }}>
                {h.status === 'paid' ? 'Payé' : h.status === 'pending' ? 'En attente' : 'Échec'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface BankingPanelData {
  hasStripeAccount: boolean;
  siret: string | null;
  email: string | null;
  payoutsEnabled?: boolean;
}

interface PayoutData {
  available: number;
  earnedTotal: number;
  paidOrPendingTotal: number;
  minPayoutCents: number;
  history: Array<{ id: string; amount_cents: number; status: string; requested_at: string; paid_at: string | null }>;
}
