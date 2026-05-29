'use client';

import { useState, useTransition } from 'react';
import { getStripeOnboardingLink } from '@/actions/stripe';

const primaryBtn: React.CSSProperties = {
  padding: '12px 20px', borderRadius: 10, border: 'none',
  background: 'var(--accent)', color: '#fff',
  fontSize: 14, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'var(--font)', width: '100%',
};

interface Props {
  mode: 'setup' | 'update';
}

// The staff member's connected account is a Stripe Standard account: identity,
// bank details and terms are collected by Stripe's own hosted onboarding. This
// component just reassures the user and hands off to that flow.
export function BankingSetupForm({ mode }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const res = await getStripeOnboardingLink();
      if ('error' in res) { setError(res.error); return; }
      // Hand off to Stripe's hosted onboarding.
      window.location.href = res.url;
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div style={{ fontSize: 12.5, color: 'var(--error)', padding: '10px 14px', background: 'var(--error-bg)', borderRadius: 8 }}>
          {error}
        </div>
      )}

      {/* Reassurance — shown before the redirect to Stripe. */}
      <div style={{
        display: 'flex', gap: 12, padding: '14px 16px', borderRadius: 10,
        background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
      }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>🔒</span>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          Vous allez être redirigé vers <strong style={{ color: 'var(--text)' }}>Stripe</strong>, notre
          partenaire de paiement (leader mondial, utilisé par des millions d&apos;entreprises).
          C&apos;est <strong style={{ color: 'var(--text)' }}>Stripe</strong> qui collecte et chiffre
          votre pièce d&apos;identité et votre IBAN — <strong style={{ color: 'var(--text)' }}>Digitip ne
          voit jamais ces informations</strong>. Vous revenez ici dès que c&apos;est terminé, et vos
          pourboires arrivent ensuite automatiquement sur votre compte.
        </div>
      </div>

      <button type="button" style={primaryBtn} disabled={pending} onClick={handleStart}>
        {pending
          ? 'Redirection…'
          : mode === 'setup'
            ? 'Configurer mes virements avec Stripe →'
            : 'Modifier mes coordonnées bancaires →'}
      </button>
    </div>
  );
}
