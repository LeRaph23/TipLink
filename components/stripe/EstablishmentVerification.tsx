'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

// Connect.js reaches for `window` and `getComputedStyle` as it boots, and the
// embedded iframe has nothing to prerender.
const EstablishmentOnboarding = dynamic(
  () => import('./EstablishmentOnboarding').then((m) => m.EstablishmentOnboarding),
  { ssr: false },
);

export type VerificationLabels = {
  legalTitle: string;
  legalCompany: string;
  legalIndividual: string;
  loadFailed: string;
  exited: string;
  checking: string;
};

/**
 * Stripe's KYC form plus the one question we ask before it.
 *
 * This lived inside the onboarding wizard's last step, which is where managers
 * stopped. It moved here so the wizard can end at "you have an account" and the
 * verification can happen from the dashboard, at the moment the banner makes
 * the case for it.
 *
 * The legal form is asked in our own UI rather than inside Stripe's because
 * Stripe only skips a question when the answer is already on the account, and
 * it files the address, the trading name and the phone under `company` or
 * `individual` depending on this one answer. Asking it here is what lets
 * everything else arrive prefilled. It is only asked once, on the call that
 * actually creates the account, so an existing account goes straight to the
 * form.
 */
export function EstablishmentVerification({
  establishmentId,
  hasAccount,
  labels,
}: {
  establishmentId: string;
  /** A Stripe account already exists, so the legal form is settled. */
  hasAccount: boolean;
  labels: VerificationLabels;
}) {
  const router = useRouter();
  const [legalForm, setLegalForm] = useState<'company' | 'individual' | null>(
    hasAccount ? 'company' : null,
  );
  const [exited, setExited] = useState(false);
  const [checking, setChecking] = useState(false);

  // Ask our own server what Stripe says, never the embedded component: anything
  // the browser claims about its own progress can be faked from the console,
  // and this decides whether the establishment stops being blocked.
  const refreshIfSubmitted = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(
        `/api/stripe/account-session?establishmentId=${encodeURIComponent(establishmentId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { detailsSubmitted?: boolean };
      // The page reads the account state server-side, so a refresh is what
      // swaps this form for the management panel and clears the banner.
      if (data.detailsSubmitted) router.refresh();
    } catch {
      // Nothing to tell the manager: the form itself is unaffected, and the
      // next check (or a reload) will pick the answer up.
    } finally {
      setChecking(false);
    }
  }, [establishmentId, router]);

  // Coming back from another tab or app, typically after fetching an ID
  // document, is the moment the answer is most likely to have changed.
  useEffect(() => {
    if (!exited) return;
    // Deferred to a macrotask so the first check never calls setState inside
    // the effect body, which would cascade a render.
    const first = setTimeout(() => void refreshIfSubmitted(), 0);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshIfSubmitted();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [exited, refreshIfSubmitted]);

  if (!legalForm) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
          {labels.legalTitle}
        </div>
        {[
          { value: 'company' as const, label: labels.legalCompany, icon: '🏢' },
          { value: 'individual' as const, label: labels.legalIndividual, icon: '🧑‍🍳' },
        ].map(({ value, label, icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setLegalForm(value)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px 18px', borderRadius: 14,
              border: '1.5px solid var(--border)',
              background: 'var(--surface)',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)',
              transition: 'border-color 150ms, background 150ms',
            }}
          >
            <span style={{ fontSize: 22 }}>{icon}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <EstablishmentOnboarding
        establishmentId={establishmentId}
        legalForm={hasAccount ? undefined : legalForm}
        onExit={() => setExited(true)}
        errorFallback={
          <div style={{ fontSize: 13, color: 'var(--error)', lineHeight: 1.6 }}>
            {labels.loadFailed}
          </div>
        }
      />

      {exited && (
        <p style={{
          marginTop: 14, fontSize: 12.5, color: 'var(--text-3)',
          textAlign: 'center', lineHeight: 1.6,
        }}>
          {checking ? labels.checking : labels.exited}
        </p>
      )}
    </div>
  );
}
