'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import {
  completePostPurchaseOnboarding,
  completeNfcOnboarding,
  completeExpressOnboarding,
  finalizeOnboarding,
} from '@/actions/onboarding';
import { AddressAutocomplete } from './AddressAutocomplete';
import { GoogleReviewPicker } from './GoogleReviewPicker';
import { EmailOtpForm } from '@/components/auth/EmailOtpForm';
import { trackEvent } from '@/lib/analytics';

// ─── Types ──────────────────────────────────────────────────────────────────

interface WizardState {
  nfcCodes: string[];
  establishmentName: string;
  businessType: 'restaurant' | 'beauty';
  address: string;
  googlePlaceId: string;
  googleReviewUrl: string;
  adminFullName: string;
  adminEmail: string;
}

// The Google listing comes first on purpose: picking it answers the name, the
// address and the trade in one search, so `confirm` is a screen the manager
// reads rather than fills in. Without a listing it falls back to the empty
// fields it replaced, which is exactly the old three steps minus two taps.
//
// Stripe's KYC form is deliberately absent. It used to be the last step and it
// is where managers stopped: the longest, least welcome part of the setup sat
// between them and any sign the thing worked. It now lives on
// /dashboard/paiements, with the dashboard banner making the case for it. The
// tag stays shut either way (get_public_staff gates on charges AND payouts), so
// nothing about the money moved, only the order of the asking.
//
// The last step is a six-digit code rather than a password. It is asked BEFORE
// anything is created, which buys three things at once: the manager finishes
// with a live session and lands on the dashboard instead of in their inbox, an
// abandoned wizard leaves no orphan group behind, and there is no password to
// invent and forget.
type ScanStep = 'google-review' | 'confirm' | 'admin-name' | 'verify';
type AuthStep = 'google-review' | 'confirm' | 'admin-name';
type ExpressStep = 'google-review' | 'confirm' | 'admin-name' | 'verify';

const SCAN_STEPS: ScanStep[] = ['google-review', 'confirm', 'admin-name', 'verify'];
const AUTH_STEPS: AuthStep[] = ['google-review', 'confirm', 'admin-name'];
const EXPRESS_STEPS: ExpressStep[] = ['google-review', 'confirm', 'admin-name', 'verify'];

/**
 * Where an in-flight wizard is kept between page loads.
 *
 * The last step sends the manager to their inbox for a six-digit code. On a
 * phone that often means switching apps, and coming back to a reloaded tab: the
 * step survives in the URL but the answers only lived in memory, so the bounce
 * guard would drop them back on screen one with everything blank. Keyed by
 * mode so a scan and a post-purchase run cannot read each other's answers.
 *
 * Not stored: whether the code was accepted. That is a live session or it is
 * nothing, and reading a stale "yes" back would offer a finish button with no
 * session behind it.
 */
const STORAGE_PREFIX = 'digitip.onboarding.';

function readStored(mode: string): Partial<WizardState> | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + mode);
    return raw ? (JSON.parse(raw) as Partial<WizardState>) : null;
  } catch {
    // Private mode, blocked site data, corrupt JSON. An empty wizard is the
    // right answer to all three.
    return null;
  }
}

type Props =
  | {
      mode: 'scan';
      initialCode: string;
      locale: string;
      establishment?: null;
      groupId?: null;
      initialEmail?: null;
    }
  | {
      mode: 'postpurchase';
      locale: string;
      initialCode?: null;
      establishment: { id: string; name: string; address: string } | null;
      groupId: string;
      initialEmail?: null;
    }
  | {
      mode: 'express';
      locale: string;
      initialCode?: null;
      establishment?: null;
      groupId: string;
      initialEmail: string;
      token: string;
    };

// ─── Styles ──────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 16,
  fontFamily: 'var(--font)',
  boxSizing: 'border-box',
  outline: 'none',
};

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--text-2)',
  marginBottom: 7,
  letterSpacing: '0.01em',
};

const btnPrimary: React.CSSProperties = {
  width: '100%',
  padding: '15px 20px',
  borderRadius: 14,
  border: 'none',
  background: 'linear-gradient(135deg, #E57A97, #EC97B0)',
  color: '#fff',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'var(--font)',
  boxShadow: '0 6px 24px rgba(229,122,151,0.35)',
  transition: 'opacity 150ms',
};

const btnSecondary: React.CSSProperties = {
  padding: '12px 20px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text-2)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'var(--font)',
};

// ─── Sub-components ──────────────────────────────────────────────────────────

export function OnboardingWizard(props: Props) {
  const { mode, locale } = props;
  const t = useTranslations('onboarding');
  const tAuth = useTranslations('auth');
  const steps = mode === 'scan' ? SCAN_STEPS : mode === 'express' ? EXPRESS_STEPS : AUTH_STEPS;

  const router = useRouter();
  const searchParams = useSearchParams();
  // A `?step=` this mode does not have falls back to the first one rather than
  // rendering a header and a body that both resolve to nothing. Steps have been
  // removed before and will be again, and the URL outlives the deploy: anyone
  // mid-wizard when it lands, or holding a bookmark, arrives with a dead value.
  const requestedStep = searchParams.get('step');
  const stepIndex = Math.max(0, steps.indexOf(requestedStep as never));
  const currentStep = steps[stepIndex] as ScanStep | AuthStep;

  const [state, dispatch] = useReducer(
    (s: WizardState, patch: Partial<WizardState>) => ({ ...s, ...patch }),
    undefined,
    // Lazy initialiser: localStorage is not readable during the server render,
    // and this runs once on the client rather than on every dispatch.
    (): WizardState => {
      const base: WizardState = {
        nfcCodes: mode === 'scan' ? [props.initialCode] : [],
        establishmentName: props.establishment?.name ?? '',
        // Every real creation path used to hardcode 'beauty', so the column said
        // "beauty" for every establishment in production regardless of trade.
        // Defaulted rather than left null because the column is NOT NULL.
        businessType: 'beauty',
        address: props.establishment?.address ?? '',
        googlePlaceId: '',
        googleReviewUrl: '',
        adminFullName: '',
        adminEmail: mode === 'express' ? props.initialEmail : '',
      };
      if (typeof window === 'undefined') return base;
      const stored = readStored(mode);
      // The tag comes from the URL the sticker points at, and the express
      // token is bound to its own group: neither may be restored from a
      // previous run in this browser.
      return stored ? { ...base, ...stored, nfcCodes: base.nfcCodes } : base;
    },
  );

  const [error, setError] = useState<string | null>(null);
  // The six-digit code was accepted and a session exists. Deliberately not
  // persisted alongside the rest of the wizard: a stale "already verified" read
  // back from storage would offer a finish button with no session behind it.
  const [verified, setVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Persist on every answer. Writing from an effect rather than inside the
  // reducer keeps the reducer pure and leaves storage as what it is: an
  // external system this component synchronises to.
  useEffect(() => {
    if (done) return;
    try {
      window.localStorage.setItem(STORAGE_PREFIX + mode, JSON.stringify(state));
    } catch {
      // Storage full or blocked. The wizard still works in one sitting.
    }
  }, [state, mode, done]);

  // Provisioning and finishing are one click, but they are two round-trips: if
  // the second fails, a retry must not create a second group, and it must still
  // carry the token minted by the first. Kept in a ref so the retry reads it in
  // the same tick it was written.
  const provisioned = useRef<{ establishmentId: string; onboardingToken?: string } | null>(null);
  // The establishment cannot be paid yet. Always true straight out of the
  // wizard now that Stripe is asked from the dashboard, but it is read from the
  // server's answer rather than assumed.
  const [payoutsPending, setPayoutsPending] = useState(false);

  // A session that already exists is the proof the code was meant to produce.
  // Without this, coming back to a reloaded tab (the very thing the stored
  // answers above are for) would ask for a second code that the first one
  // already made unnecessary.
  useEffect(() => {
    let cancelled = false;
    void createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled && data.user) setVerified(true);
      });
    return () => { cancelled = true; };
  }, []);

  const goTo = useCallback(
    (step: string) => {
      setError(null);
      const p = new URLSearchParams(searchParams.toString());
      p.set('step', step);
      router.replace(`/${locale}/onboarding?${p.toString()}`, { scroll: false });
    },
    [router, locale, searchParams]
  );

  const isStepComplete = useCallback(
    (step: string): boolean => {
      switch (step) {
        // Soft-required: never blocks navigation (a discreet "skip" link exists),
        // so the bounce-back guard treats it as satisfied.
        case 'google-review': return true;
        // The trade always has a value, so the two free-text fields decide.
        case 'confirm':
          return state.establishmentName.trim().length > 0 && state.address.trim().length > 0;
        case 'admin-name': return state.adminFullName.trim().length > 0;
        // The step gates itself: the finish button only appears once the code
        // has been verified, so navigation never has to hold it shut.
        case 'verify': return true;
        default: return true;
      }
    },
    [state]
  );

  const canAdvance = (): boolean => isStepComplete(currentStep);

  // Guard against landing on a step past unfilled prerequisites. The current
  // step is persisted in the URL (?step=…) but the collected data lives only in
  // in-memory state, so a page reload or browser back/forward can restore a late
  // step with empty fields. Submitting from there would send
  // blank values to the server action and surface a raw Zod
  // "Too small: expected string to have >=1 characters" error. Instead, bounce
  // the user back to the first incomplete step so they re-enter their details.
  useEffect(() => {
    if (done) return;
    const firstIncomplete = steps.findIndex((s) => !isStepComplete(s));
    if (firstIncomplete !== -1 && stepIndex > firstIncomplete) {
      // Redirect via the router directly (not goTo) so we only sync the URL —
      // an external system — without a synchronous setState inside the effect.
      const p = new URLSearchParams(searchParams.toString());
      p.set('step', steps[firstIncomplete]);
      router.replace(`/${locale}/onboarding?${p.toString()}`, { scroll: false });
    }
  }, [stepIndex, steps, isStepComplete, done, router, locale, searchParams]);

  const next = () => {
    // Steps live in the query string and advance via router.replace, so they
    // never produce a pageview — without this event the whole wizard is a
    // single row in analytics and the drop-off step is unknowable.
    trackEvent('onboarding_step_completed', { mode, step: currentStep, index: stepIndex });
    const s = steps[stepIndex + 1];
    if (s) goTo(s);
  };

  const back = () => {
    const s = steps[stepIndex - 1];
    if (s) goTo(s);
  };

  /**
   * Closes the wizard: creates the account and everything it owns, then marks
   * onboarding done.
   *
   * This used to be two acts, with Stripe's KYC form between them. The form
   * moved to /dashboard/paiements, so provisioning and finishing are the same
   * click again, and the manager lands on a dashboard rather than on a
   * verification chore.
   */
  async function handleFinish() {
    // Re-entrant guard: the button can be clicked twice, and in scan mode a
    // second provisioning run creates a duplicate group.
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      if (!provisioned.current) {
        const result = await provision();
        if ('error' in result) {
          setError(result.error);
          setSubmitting(false);
          return;
        }
        provisioned.current = result;
      }

      const finalized = await finalizeOnboarding({
        establishmentId: provisioned.current.establishmentId,
        token: provisioned.current.onboardingToken,
      });
      if ('error' in finalized) {
        setError(finalized.error);
        setSubmitting(false);
        return;
      }

      trackEvent('onboarding_submitted', { mode, payoutsEnabled: finalized.payoutsEnabled });

      // The run is over; leaving the answers behind would prefill the next
      // establishment created from this browser with the previous one's name.
      try {
        window.localStorage.removeItem(STORAGE_PREFIX + mode);
      } catch {
        // Nothing was written in the first place.
      }

      // No sign-out and no "check your inbox" any more: the code the manager
      // typed two screens ago both created the account and confirmed the
      // address, so the session they finish on is the one they keep.
      // Always true at this point in practice: the Stripe account is created
      // from the dashboard now, so nothing can charge yet. The done screen says
      // so rather than implying the tag is live.
      setPayoutsPending(!finalized.chargesEnabled || !finalized.payoutsEnabled);
      setDone(true);
      setSubmitting(false);
    } catch (err) {
      // Without this, a thrown error (server action 500, network failure) would
      // leave the button stuck on "Finalisation…" for ever.
      console.error('onboarding finalize failed', err);
      setError(tAuth('errorGeneric'));
      setSubmitting(false);
    }
  }

  /**
   * The signed-in manager's id.
   *
   * The account exists before this runs: verifying the code is what creates it,
   * and it hands back a session. That replaces the signUp() this used to do,
   * along with the retry bookkeeping it needed, since the account can no longer
   * be created and then stranded by a failing server action.
   */
  async function currentUserId(): Promise<string | null> {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  }

  /** Creates the group, the establishment and the roles for the current mode. */
  async function provision(): Promise<
    { establishmentId: string; onboardingToken?: string } | { error: string }
  > {
    if (mode === 'scan') {
      const userId = await currentUserId();
      if (!userId) return { error: tAuth('errorGeneric') };

      const result = await completeNfcOnboarding({
        userId,
        nfcCodes: state.nfcCodes,
        establishmentName: state.establishmentName,
        address: state.address,
        googlePlaceId: state.googlePlaceId || undefined,
        googleReviewUrl: state.googleReviewUrl || undefined,
        adminFullName: state.adminFullName,
        businessType: state.businessType,
        locale: locale as 'fr' | 'en',
      });
      return 'error' in result
        ? { error: result.error }
        : { establishmentId: result.establishmentId, onboardingToken: result.onboardingToken };
    }

    if (mode === 'express') {
      const userId = await currentUserId();
      if (!userId) return { error: tAuth('errorGeneric') };

      const result = await completeExpressOnboarding({
        groupId: props.groupId,
        token: props.token,
        establishmentName: state.establishmentName,
        address: state.address,
        googlePlaceId: state.googlePlaceId || undefined,
        googleReviewUrl: state.googleReviewUrl || undefined,
        adminFullName: state.adminFullName,
        businessType: state.businessType,
        locale: locale as 'fr' | 'en',
        userId,
      });
      return 'error' in result
        ? { error: result.error }
        : { establishmentId: result.establishmentId, onboardingToken: result.onboardingToken };
    }

    const result = await completePostPurchaseOnboarding({
      establishmentName: state.establishmentName,
      address: state.address,
      googlePlaceId: state.googlePlaceId || undefined,
      googleReviewUrl: state.googleReviewUrl || undefined,
      adminFullName: state.adminFullName,
      businessType: state.businessType,
      locale: locale as 'fr' | 'en',
    });
    return 'error' in result
      ? { error: result.error }
      : { establishmentId: result.establishmentId, onboardingToken: result.onboardingToken };
  }

  // ─── Done screen ───────────────────────────────────────────────────────────

  if (done) {
    return (
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          textAlign: 'center',
          animation: 'onbSlideIn 280ms ease-out',
        }}
      >
        <style>{`@keyframes onbSlideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--success-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 10 }}>
          {t('done.title')}
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-3)', lineHeight: 1.7, marginBottom: 24 }}>
          {t('done.body', { name: state.establishmentName })}
        </p>
        {/* The tip pages stay closed until charges and payouts light up, which
            now means until the manager does the Stripe verification from the
            dashboard. Saying so here is the handover: the banner picks the
            same thread up on the other side. */}
        {payoutsPending && (
          <div style={{
            background: 'var(--surface-2)', border: '1px solid rgba(229,122,151,0.25)',
            borderRadius: 12, padding: '12px 16px', marginBottom: 24, textAlign: 'left',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
              {t('done.payoutsPendingTitle')}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
              {t('done.payoutsPendingBody')}
            </div>
          </div>
        )}
        <button
          onClick={() => router.push(`/${locale}/dashboard`)}
          style={{ ...btnPrimary, maxWidth: 320, margin: '0 auto', display: 'block' }}
        >
          {t('done.cta')}
        </button>
      </div>
    );
  }

  // ─── Step content ──────────────────────────────────────────────────────────

  // Maps a step id to its i18n key prefix in the `onboarding` namespace
  // (the dashed step ids differ from the camelCase message keys).
  const STEP_I18N: Record<string, string> = {
    'google-review': 'googleReview',
    confirm: 'confirm',
    'admin-name': 'adminName', verify: 'verify',
  };
  const i18nKey = STEP_I18N[currentStep];
  const config = i18nKey
    ? { title: t(`${i18nKey}.title`), subtitle: t(`${i18nKey}.subtitle`) }
    : { title: '', subtitle: '' };
  // The last step is `verify` in scan and express mode, and it only becomes
  // finishable once the code has been accepted. In postpurchase mode the
  // manager already has a session, so the last step is finishable outright.
  const isLastStep = stepIndex === steps.length - 1;
  const awaitingCode = currentStep === 'verify' && !verified;
  const totalSteps = steps.length;
  // Google review is soft-required: the primary CTA stays disabled until a link
  // is chosen, but a discreet skip link lets the manager move on.
  const reviewBlocking = currentStep === 'google-review' && state.googleReviewUrl.trim().length === 0;
  // The confirmation screen carries three fields and their labels; at the
  // default header size it fell below the fold on a phone, so the header gives
  // up the difference. See the header comment below.
  const dense = currentStep === 'confirm';

  function renderStepBody() {
    switch (currentStep) {
      case 'google-review':
        return (
          <GoogleReviewPicker
            name={state.establishmentName}
            address={state.address}
            value={state.googleReviewUrl}
            placeId={state.googlePlaceId}
            onChange={({ placeId, reviewUrl, place }) =>
              dispatch({
                googlePlaceId: placeId ?? '',
                googleReviewUrl: reviewUrl,
                // The listing is the source for the next screen. Only fill from
                // it, never blank from it: clearing the selection to search
                // again must not wipe what the manager already corrected.
                ...(place?.displayName ? { establishmentName: place.displayName } : {}),
                ...(place?.formattedAddress ? { address: place.formattedAddress } : {}),
                ...(place?.businessType ? { businessType: place.businessType } : {}),
              })
            }
          />
        );

      case 'confirm':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={fieldLabel} htmlFor="onb-name">{t('confirm.nameLabel')}</label>
              <input
                id="onb-name"
                autoFocus
                type="text"
                value={state.establishmentName}
                onChange={(e) => dispatch({ establishmentName: e.target.value })}
                style={inp}
              />
            </div>

            <div>
              <label style={fieldLabel} htmlFor="onb-address">{t('confirm.addressLabel')}</label>
              <AddressAutocomplete
                value={state.address}
                onChange={(address) => dispatch({ address })}
                onConfirm={() => canAdvance() && next()}
                style={inp}
              />
            </div>

            <div>
              <span style={fieldLabel}>{t('confirm.typeLabel')}</span>
              <div style={{ display: 'flex', gap: 10 }}>
                {(
                  [
                    { value: 'restaurant', label: t('businessType.restaurant'), icon: '🍽️' },
                    { value: 'beauty', label: t('businessType.beauty'), icon: '💇' },
                  ] as const
                ).map(({ value, label, icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => dispatch({ businessType: value })}
                    style={{
                      flex: 1,
                      display: 'flex', alignItems: 'center', gap: 9,
                      padding: '13px 14px', borderRadius: 12,
                      border: `1.5px solid ${state.businessType === value ? 'var(--accent)' : 'var(--border)'}`,
                      background: state.businessType === value ? 'var(--surface-2)' : 'var(--surface)',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)',
                      transition: 'border-color 150ms, background 150ms',
                    }}
                  >
                    <span style={{ fontSize: 19 }}>{icon}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'admin-name':
        return (
          <input
            autoFocus
            type="text"
            value={state.adminFullName}
            onChange={(e) => dispatch({ adminFullName: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && canAdvance() && (isLastStep ? handleFinish() : next())}
            style={inp}
          />
        );

      case 'verify':
        // Already signed in: either the code just landed, or the manager was
        // logged in before the scan and is adding a second establishment.
        // Showing the code form beside an enabled finish button would ask for
        // something that is already done.
        if (verified) {
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '16px 18px', borderRadius: 14,
              border: '1.5px solid var(--accent)', background: 'var(--surface-2)',
            }}>
              <span style={{ fontSize: 22 }}>✅</span>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                {t('verify.confirmed')}
              </div>
            </div>
          );
        }
        return (
          <EmailOtpForm
            initialEmail={state.adminEmail}
            // The address may not exist yet: for a manager arriving from a
            // scan, this call is what creates the account.
            shouldCreateUser
            fullName={state.adminFullName}
            submitLabel={t('verify.send')}
            onVerified={() => {
              // Only flips a flag. Provisioning waits for the explicit finish
              // click, so the manager sees what they are about to create.
              setVerified(true);
            }}
            // Remember the address the widget settled on, so a resume after a
            // reload comes back with it filled in.
            onEmailChange={(adminEmail) => dispatch({ adminEmail })}
          />
        );

      default:
        return null;
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 480 }}>
      <style>{`
        @keyframes onbSlideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Progress bar */}
      <div style={{
        height: 3,
        background: 'var(--border)',
        borderRadius: 999,
        marginBottom: 40,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${((stepIndex + 1) / totalSteps) * 100}%`,
          background: 'linear-gradient(90deg, #E57A97, #EC97B0)',
          borderRadius: 999,
          transition: 'width 300ms ease',
        }} />
      </div>

      {/* Step label */}
      <p style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {t('stepOf', { current: stepIndex + 1, total: totalSteps })}
      </p>

      {/* Step header + body. The header shrinks on the tall steps — see
          `dense` above. */}
      <div key={currentStep} style={{ animation: 'onbSlideIn 220ms ease-out' }}>
        <h1 style={{
          fontSize: dense ? 23 : 28,
          fontWeight: 800,
          color: 'var(--text)',
          letterSpacing: '-0.03em',
          marginBottom: dense ? 6 : 8,
          lineHeight: 1.2,
        }}>
          {config.title}
        </h1>
        <p style={{
          fontSize: dense ? 13.5 : 15,
          color: 'var(--text-3)',
          lineHeight: dense ? 1.5 : 1.6,
          marginBottom: dense ? 16 : 28,
        }}>
          {config.subtitle}
        </p>

        {renderStepBody()}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          marginTop: 16,
          padding: '12px 16px',
          borderRadius: 10,
          background: 'var(--error-bg)',
          color: 'var(--error)',
          fontSize: 13.5,
          lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}

      {/* Navigation */}
      <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {awaitingCode ? null : isLastStep ? (
          <>
            <button
              type="button"
              onClick={() => handleFinish()}
              disabled={submitting || !canAdvance()}
              style={{
                ...btnPrimary,
                opacity: (submitting || !canAdvance()) ? 0.5 : 1,
              }}
            >
              {submitting ? t('finishing') : t('finish')}
            </button>

          </>
        ) : (
          <button
            type="button"
            onClick={next}
            // `submitting` matters on the step before Connect: that transition
            // provisions the whole account server-side, which takes seconds. The
            // button used to sit there looking idle and clickable throughout, so
            // the wizard read as frozen.
            disabled={!canAdvance() || reviewBlocking || submitting}
            style={{
              ...btnPrimary,
              opacity: (canAdvance() && !reviewBlocking && !submitting) ? 1 : 0.4,
            }}
          >
            {submitting ? t('creating') : t('continue')}
          </button>
        )}

        {/* Explain why the action button is greyed out instead of leaving the
            user guessing. Not shown on steps with no required field. */}
        {!canAdvance() && !submitting && !awaitingCode && (
          <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', margin: 0 }}>
            {t('fillField')}
          </p>
        )}

        {/* Soft-required Google review step. Still visually secondary — we want
            most managers to set this up — but readable: the Google search can be
            unavailable for reasons the manager cannot do anything about, and at
            11.5px with 0.7 opacity this was an exit nobody could find. */}
        {currentStep === 'google-review' && reviewBlocking && (
          <button
            type="button"
            onClick={next}
            style={{
              background: 'none', border: 'none', color: 'var(--text-3)',
              fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
              textDecoration: 'underline', textUnderlineOffset: 3,
              textAlign: 'center', padding: 0, marginTop: 2,
            }}
          >
            {t('googleReview.skip')}
          </button>
        )}

        {stepIndex > 0 && (
          <button
            type="button"
            onClick={back}
            style={{
              ...btnSecondary,
              width: '100%',
              textAlign: 'center',
            }}
          >
            {t('back')}
          </button>
        )}
      </div>
    </div>
  );
}
