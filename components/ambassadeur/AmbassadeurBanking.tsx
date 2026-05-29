'use client';

import { useState } from 'react';
import { Card, SectionHeader, Button, Badge, Stat, Field, Input, FONT, WEIGHT, SPACE } from './ui';
import { Icon } from './icons';

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
      setError("SIRET invalide. Pas encore de SIRET ? Créez-le gratuitement sur autoentrepreneur.urssaf.fr.");
      return;
    }
    if (!email.trim()) { setError('Email requis.'); return; }
    if (!pledge) { setError("Vous devez accepter l'engagement de non-fraude."); return; }

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

  const noteBox: React.CSSProperties = {
    borderRadius: 'var(--radius-sm)', padding: '10px 14px',
    fontSize: FONT.body - 1, color: 'var(--text-2)', lineHeight: 1.45,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
      <div style={{
        ...noteBox,
        background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
        display: 'flex', gap: SPACE.sm, alignItems: 'flex-start',
      }}>
        <Icon name="lock" size={15} style={{ marginTop: 1 }} />
        <span>
          <strong>Paiements sécurisés par Stripe.</strong> Vous allez être redirigé vers
          Stripe, notre partenaire de paiement, pour saisir votre IBAN et vérifier votre
          identité. Digitip ne voit jamais vos informations bancaires.
        </span>
      </div>

      <div style={{ ...noteBox, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <strong>SIRET obligatoire</strong> pour recevoir vos virements.{' '}
        Pas encore de SIRET ? Créez-le gratuitement sur{' '}
        <a href="https://autoentrepreneur.urssaf.fr" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          autoentrepreneur.urssaf.fr
        </a>.
      </div>

      {error && (
        <div style={{ fontSize: FONT.body, color: 'var(--error)', padding: '10px 14px', background: 'var(--error-bg)', borderRadius: 'var(--radius-sm)' }}>
          {error}
        </div>
      )}

      <Field label="SIRET (14 chiffres)" style={{ marginBottom: 0 }}>
        <Input value={siret} onChange={(e) => setSiret(e.target.value)} placeholder="12345678901234" inputMode="numeric" />
      </Field>

      <Field label="Email" style={{ marginBottom: 0 }}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@email.com" />
      </Field>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={pledge} onChange={(e) => setPledge(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: FONT.body - 1, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Je m&apos;engage à ne pas frauder (pas de fausses ventes, pas de codes promo utilisés sur mes propres commandes).
        </span>
      </label>

      <Button full onClick={submit} loading={submitting} iconRight={<Icon name="arrowRight" size={15} />}>
        {submitting ? 'Redirection vers Stripe…' : 'Configurer mes virements'}
      </Button>
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

  const feedbackBox: React.CSSProperties = {
    fontSize: FONT.body, padding: '8px 12px', borderRadius: 'var(--radius-sm)', marginBottom: SPACE.sm,
  };

  // No connected account yet, or one exists but Stripe onboarding is unfinished
  // (payouts not yet enabled) — both states route the ambassador to Stripe.
  if (!banking.hasStripeAccount || !banking.payoutsEnabled) {
    const pending = banking.hasStripeAccount;
    return (
      <Card>
        <SectionHeader title="Virements" icon={<Icon name="wallet" size={14} />} style={{ marginBottom: SPACE.md }} />
        {!setupOpen ? (
          <>
            <div style={{ fontSize: FONT.body, color: 'var(--text-2)', marginBottom: SPACE.md, lineHeight: 1.5 }}>
              {pending
                ? "Votre configuration Stripe n'est pas encore terminée. Reprenez-la pour pouvoir recevoir vos commissions."
                : 'Configurez votre compte pour recevoir vos commissions par virement bancaire.'}
            </div>
            <Button onClick={() => setSetupOpen(true)}>
              {pending ? 'Reprendre la configuration' : 'Configurer mon compte bancaire'}
            </Button>
          </>
        ) : (
          <AmbassadeurBankingForm
            code={code}
            defaults={{ email: banking.email, siret: banking.siret }}
          />
        )}
      </Card>
    );
  }

  // Banking is configured — show available balance + payout button
  const available = payout?.available ?? 0;
  const minCents = payout?.minPayoutCents ?? 3000;
  const canPayout = available >= minCents;

  return (
    <Card>
      <SectionHeader title="Virements" icon={<Icon name="wallet" size={14} />} style={{ marginBottom: SPACE.md }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: SPACE.md, flexWrap: 'wrap', marginBottom: SPACE.md }}>
        <Stat label="Solde disponible" value={fmt(available)} />
        {payout && payout.paidOrPendingTotal > 0 && (
          <div style={{ fontSize: FONT.label, color: 'var(--text-3)' }}>
            Déjà versé : {fmt(payout.paidOrPendingTotal)}
          </div>
        )}
      </div>

      {error && (
        <div style={{ ...feedbackBox, color: 'var(--error)', background: 'var(--error-bg)' }}>{error}</div>
      )}
      {successMsg && (
        <div style={{ ...feedbackBox, color: 'var(--success)', background: 'var(--success-bg)' }}>{successMsg}</div>
      )}

      <Button full onClick={handlePayout} disabled={!canPayout} loading={requesting}>
        {requesting ? 'Demande en cours…' : `Virer ${fmt(available)} sur mon IBAN`}
      </Button>

      {!canPayout && (
        <div style={{ fontSize: FONT.label, color: 'var(--text-3)', marginTop: SPACE.sm, textAlign: 'center' }}>
          Minimum {fmt(minCents)} — il vous manque {fmt(minCents - available)}.
        </div>
      )}

      {payout && payout.history.length > 0 && (
        <div style={{ marginTop: SPACE.md, paddingTop: SPACE.md, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: FONT.micro, fontWeight: WEIGHT.bold, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            Historique
          </div>
          {payout.history.slice(0, 5).map((h) => (
            <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SPACE.sm, padding: '5px 0', fontSize: FONT.body - 1 }}>
              <span style={{ color: 'var(--text-3)' }}>
                {new Date(h.requested_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              </span>
              <span style={{ fontWeight: WEIGHT.semibold, marginLeft: 'auto', marginRight: SPACE.sm }}>{fmt(h.amount_cents)}</span>
              <Badge tone={h.status === 'paid' ? 'success' : h.status === 'pending' ? 'warning' : 'error'}>
                {h.status === 'paid' ? 'Payé' : h.status === 'pending' ? 'En attente' : 'Échec'}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
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
