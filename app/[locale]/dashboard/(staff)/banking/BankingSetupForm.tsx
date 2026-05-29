'use client';

import { useState, useTransition } from 'react';
import { getStripeOnboardingLink } from '@/actions/stripe';

const primaryBtn: React.CSSProperties = {
  padding: '13px 20px', borderRadius: 12, border: 'none',
  background: 'var(--accent)', color: '#fff',
  fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'var(--font)', width: '100%',
};

const ghostBtn: React.CSSProperties = {
  padding: '13px 20px', borderRadius: 12,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-2)', fontSize: 14, fontWeight: 500,
  cursor: 'pointer', fontFamily: 'var(--font)',
};

interface Props {
  mode: 'setup' | 'update';
}

// Line-style icons matching the dashboard nav set (16×16, currentColor stroke).
const svgBase = {
  width: 28, height: 28, viewBox: '0 0 16 16', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.4,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};
function CardIcon() {
  return <svg {...svgBase}><rect x="1" y="4" width="14" height="9" rx="1.5" /><path d="M1 7h14" /><path d="M3.5 10.5h2.5" /></svg>;
}
function LockIcon() {
  return <svg {...svgBase}><rect x="3" y="7" width="10" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>;
}
function CheckIcon() {
  return <svg {...svgBase}><circle cx="8" cy="8" r="6.5" /><path d="M5.3 8.2l1.8 1.8 3.6-3.8" /></svg>;
}

// One idea per screen, mobile-first: instead of a single dense reassurance
// paragraph, the setup walks through three light cards (what happens →
// privacy → go) before handing off to Stripe's hosted onboarding. The update
// mode skips the explainer since the user has already been through it once.
const STEPS = [
  {
    Icon: CardIcon,
    title: 'Vos pourboires sur votre compte',
    body: 'Configurez vos virements en 2 minutes avec Stripe, notre partenaire de paiement.',
  },
  {
    Icon: LockIcon,
    title: 'Vos données restent privées',
    body: 'C’est Stripe qui collecte et chiffre votre pièce d’identité et votre IBAN. Digitip ne les voit jamais.',
  },
  {
    Icon: CheckIcon,
    title: 'Prêt à configurer',
    body: 'Vous allez être redirigé vers Stripe. Vous revenez ici dès que c’est terminé, et vos pourboires arrivent ensuite automatiquement.',
  },
] as const;

export function BankingSetupForm({ mode }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const res = await getStripeOnboardingLink();
      if ('error' in res) { setError(res.error); return; }
      // Hand off to Stripe's hosted onboarding.
      window.location.href = res.url;
    });
  }

  // Already configured → no explainer, just the action.
  if (mode === 'update') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div style={{ fontSize: 12.5, color: 'var(--error)', padding: '10px 14px', background: 'var(--error-bg)', borderRadius: 8 }}>
            {error}
          </div>
        )}
        <button type="button" style={primaryBtn} disabled={pending} onClick={handleStart}>
          {pending ? 'Ouverture de Stripe…' : 'Modifier mes coordonnées bancaires →'}
        </button>
      </div>
    );
  }

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{`@keyframes onbSlideIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}@media(prefers-reduced-motion:reduce){.onb-card{animation:none!important}}`}</style>
      {error && (
        <div style={{ fontSize: 12.5, color: 'var(--error)', padding: '10px 14px', background: 'var(--error-bg)', borderRadius: 8 }}>
          {error}
        </div>
      )}

      {/* Single-idea card, re-animated on each step change. */}
      <div
        key={stepIdx}
        className="onb-card"
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
          gap: 10, padding: '28px 20px', borderRadius: 14,
          background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
          animation: 'onbSlideIn 220ms ease-out',
        }}
      >
        <span aria-hidden style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 52, height: 52, borderRadius: 14, marginBottom: 2,
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          color: 'var(--accent)',
        }}>
          <step.Icon />
        </span>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          {step.title}
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, margin: 0, maxWidth: 320 }}>
          {step.body}
        </p>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
        {STEPS.map((_, i) => (
          <span
            key={i}
            style={{
              width: i === stepIdx ? 18 : 6, height: 6, borderRadius: 999,
              background: i === stepIdx ? 'var(--accent)' : 'var(--border)',
              transition: 'all 200ms',
            }}
          />
        ))}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 10 }}>
        {stepIdx > 0 && (
          <button type="button" style={ghostBtn} onClick={() => setStepIdx((i) => i - 1)} disabled={pending}>
            ← Retour
          </button>
        )}
        {isLast ? (
          <button type="button" style={{ ...primaryBtn, flex: 1 }} disabled={pending} onClick={handleStart}>
            {pending ? 'Ouverture de Stripe…' : 'Configurer avec Stripe →'}
          </button>
        ) : (
          <button type="button" style={{ ...primaryBtn, flex: 1 }} onClick={() => setStepIdx((i) => i + 1)}>
            Continuer →
          </button>
        )}
      </div>
    </div>
  );
}
