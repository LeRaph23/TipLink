'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { getStripeOnboardingLink } from '@/actions/stripe';
import { StripeOnboardingPrimer } from '@/components/payment/StripeOnboardingPrimer';
import { trackEvent } from '@/lib/analytics';

const primaryBtn: React.CSSProperties = {
  padding: '13px 20px', borderRadius: 12, border: 'none',
  background: 'var(--accent)', color: '#fff',
  fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'var(--font)', width: '100%',
};

interface Props {
  mode: 'setup' | 'update';
}

export function BankingSetupForm({ mode }: Props) {
  const t = useTranslations('dashboard.banking');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const res = await getStripeOnboardingLink();
      if ('error' in res) { setError(res.error); return; }
      // The next navigation leaves the app entirely, so this is the last
      // moment we can record that KYC was attempted. Paired with the
      // stripe_returned_* events on the banking page, it turns an invisible
      // hand-off into a measurable step.
      trackEvent('stripe_link_requested', { mode });
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
        <button
          type="button"
          style={{ ...primaryBtn, opacity: pending ? 0.6 : 1, cursor: pending ? 'not-allowed' : 'pointer' }}
          disabled={pending}
          onClick={handleStart}
        >
          {pending ? t('openingStripe') : t('updateCta')}
        </button>
      </div>
    );
  }

  // First-time setup → walk the staff member through the shared pre-onboarding
  // primer before handing off to Stripe.
  return <StripeOnboardingPrimer onContinue={handleStart} pending={pending} error={error} />;
}
