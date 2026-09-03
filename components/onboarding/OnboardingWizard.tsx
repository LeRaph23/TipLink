'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import dynamic from 'next/dynamic';
import {
  completePostPurchaseOnboarding,
  completeNfcOnboarding,
  completeExpressOnboarding,
  finalizeOnboarding,
} from '@/actions/onboarding';
import { AddressAutocomplete } from './AddressAutocomplete';
import { GoogleReviewPicker } from './GoogleReviewPicker';
import { getBaseUrl } from '@/lib/env';
import { mapAuthError } from '@/lib/auth/map-auth-error';
import { trackEvent } from '@/lib/analytics';

// Connect.js reaches for `window` and `getComputedStyle` as it boots, and the
// embedded iframe has nothing to prerender, so this stays out of SSR.
const EstablishmentOnboarding = dynamic(
  () => import('@/components/stripe/EstablishmentOnboarding').then((m) => m.EstablishmentOnboarding),
  { ssr: false },
);

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
  password: string;
}

/** How far Stripe says the establishment's account has got. */
type ConnectReadiness = 'unknown' | 'checking' | 'incomplete' | 'submitted';

// The Google listing comes first on purpose: picking it answers the name, the
// address and the trade in one search, so `confirm` is a screen the manager
// reads rather than fills in. Without a listing it falls back to the empty
// fields it replaced, which is exactly the old three steps minus two taps.
type ScanStep = 'google-review' | 'confirm' | 'admin-name' | 'email' | 'password' | 'connect';
type AuthStep = 'google-review' | 'confirm' | 'admin-name' | 'connect';
type ExpressStep = 'google-review' | 'confirm' | 'admin-name' | 'email' | 'password' | 'connect';

const SCAN_STEPS: ScanStep[] = ['google-review', 'confirm', 'admin-name', 'email', 'password', 'connect'];
const AUTH_STEPS: AuthStep[] = ['google-review', 'confirm', 'admin-name', 'connect'];
const EXPRESS_STEPS: ExpressStep[] = ['google-review', 'confirm', 'admin-name', 'email', 'password', 'connect'];

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
  const currentStep = (searchParams.get('step') ?? steps[0]) as ScanStep | AuthStep;
  const stepIndex = Math.max(
    0,
    steps.indexOf(currentStep as never)
  );

  const [state, dispatch] = useReducer(
    (s: WizardState, patch: Partial<WizardState>) => ({ ...s, ...patch }),
    {
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
      password: '',
    }
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);

  // The auth user created by a previous provisioning attempt.
  //
  // Sign-up and the server action are two steps, and only the second one is
  // rolled back on failure. Without this, retrying after a failure that struck
  // between them replays signUp() against an address that now exists, and the
  // manager is stuck on "un compte existe déjà" with no way to finish. A ref,
  // not state: the retry reads it in the same tick it is written.
  const createdUserId = useRef<string | null>(null);

  // Set once the group / establishment / roles exist, which is what the Connect
  // step needs before it can attach a Stripe account to anything.
  const [provisioned, setProvisioned] = useState<{
    establishmentId: string;
    onboardingToken?: string;
  } | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  // Stripe accepted the form but is still verifying. Onboarding is done; the
  // tip pages just stay closed until charges and payouts light up.
  const [payoutsPending, setPayoutsPending] = useState(false);
  // The embedded component told us the account holder left the form. Only a
  // hint that it is worth re-asking Stripe — never proof of completion.
  const [connectExited, setConnectExited] = useState(false);

  // What Stripe actually says about the establishment's account.
  //
  // 'unknown' covers both "not asked yet" and "the check failed", and both let
  // the finish button through on purpose: finalizeOnboarding re-reads Stripe
  // server-side and refuses a half-finished account anyway, so a failed poll
  // must never be the thing that strands a manager on the last step. Disabling
  // the button is a courtesy on top of that gate, not the gate itself.
  // Company or sole trader, asked here rather than inside Stripe's form.
  //
  // Stripe only skips a question when the answer is already on the account, and
  // it files the address under `company` or `individual` depending on this — so
  // one question in our own UI is what lets the address, the trading name and
  // the business type all arrive prefilled. The embedded form is mounted only
  // once it is answered, because the account is created on its first request.
  const [legalForm, setLegalForm] = useState<'company' | 'individual' | null>(null);

  //
  // Starts at 'checking' so the last step never flashes an enabled button in the
  // window before the first answer comes back.
  const [connectReady, setConnectReady] =
    useState<ConnectReadiness>('checking');

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
        case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.adminEmail);
        case 'password': return state.password.length >= 8;
        // Navigation-wise always reachable; the finish button is what enforces
        // that Stripe actually got the onboarding form (see handleFinish).
        case 'connect': return true;
        default: return true;
      }
    },
    [state]
  );

  const canAdvance = (): boolean => isStepComplete(currentStep);

  // Guard against landing on a step past unfilled prerequisites. The current
  // step is persisted in the URL (?step=…) but the collected data lives only in
  // in-memory state, so a page reload or browser back/forward can restore a late
  // step (e.g. "banking") with empty fields. Submitting from there would send
  // blank values to the server action and surface a raw Zod
  // "Too small: expected string to have >=1 characters" error. Instead, bounce
  // the user back to the first incomplete step so they re-enter their details.
  useEffect(() => {
    if (done || needsEmailVerification) return;
    const firstIncomplete = steps.findIndex((s) => !isStepComplete(s));
    if (firstIncomplete !== -1 && stepIndex > firstIncomplete) {
      // Redirect via the router directly (not goTo) so we only sync the URL —
      // an external system — without a synchronous setState inside the effect.
      const p = new URLSearchParams(searchParams.toString());
      p.set('step', steps[firstIncomplete]);
      router.replace(`/${locale}/onboarding?${p.toString()}`, { scroll: false });
    }
  }, [stepIndex, steps, isStepComplete, done, needsEmailVerification, router, locale, searchParams]);

  const next = () => {
    // Steps live in the query string and advance via router.replace, so they
    // never produce a pageview — without this event the whole wizard is a
    // single row in analytics and the drop-off step is unknowable.
    trackEvent('onboarding_step_completed', { mode, step: currentStep, index: stepIndex });
    // Entering the Connect step needs an establishment to attach the account
    // to, so that transition provisions first and navigates on success.
    if (steps[stepIndex + 1] === 'connect') {
      void provisionThenAdvance();
      return;
    }
    const s = steps[stepIndex + 1];
    if (s) goTo(s);
  };

  const back = () => {
    const s = steps[stepIndex - 1];
    if (s) goTo(s);
  };

  /**
   * Asks our server what Stripe thinks of the account, so the last step can
   * tell "the form is still half-filled" apart from "ready to finish".
   *
   * Deliberately not driven by the embedded component's own completion
   * callback: anything the browser claims about its own progress can be faked
   * from the console, and this decides whether onboarding may close.
   */
  const fetchConnectStatus = useCallback(async (): Promise<ConnectReadiness> => {
    if (!provisioned) return 'unknown';
    try {
      const q = new URLSearchParams({ establishmentId: provisioned.establishmentId });
      if (provisioned.onboardingToken) q.set('token', provisioned.onboardingToken);
      const res = await fetch(`/api/stripe/account-session?${q.toString()}`);
      if (!res.ok) return 'unknown';
      const data = (await res.json()) as { detailsSubmitted?: boolean };
      return data.detailsSubmitted ? 'submitted' : 'incomplete';
    } catch {
      return 'unknown';
    }
  }, [provisioned]);

  // Ask on arrival, then keep asking until Stripe says the form was submitted.
  //
  // Polling rather than waiting for a click: the embedded component finishes
  // inside its own iframe and does not reliably tell us so, and a manager who
  // has just filled in a KYC form should find the way out already open rather
  // than have to hunt for a "check again" link. The state is set from callbacks
  // rather than the effect body so this stays a subscription to an external
  // system instead of a cascading render.
  useEffect(() => {
    if (currentStep !== 'connect' || !provisioned) return;
    let cancelled = false;
    let polls = 0;
    // Submitted is terminal for this step, so the loop stops asking.
    let settled = false;

    const read = () => {
      void fetchConnectStatus().then((status) => {
        if (cancelled) return;
        setConnectReady(status);
        if (status === 'submitted') settled = true;
      });
    };

    read();

    // GET /api/stripe/account-session allows 10 calls a minute per IP and each
    // one reaches Stripe, so this stays well under that and only runs while the
    // tab is in front. POLL_CAP stops an abandoned tab polling for ever; the
    // manual re-check below is the way back after that.
    const POLL_MS = 10_000;
    const POLL_CAP = 40;
    const timer = setInterval(() => {
      if (settled || polls >= POLL_CAP) {
        clearInterval(timer);
        return;
      }
      if (document.visibilityState !== 'visible') return;
      polls += 1;
      read();
    }, POLL_MS);

    // Coming back from another tab or app — fetching an ID document, say — is
    // the moment the answer is most likely to have changed.
    const onVisible = () => {
      if (!settled && document.visibilityState === 'visible') read();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentStep, provisioned, connectExited, fetchConnectStatus]);

  // Same question, asked by hand: the embedded form does not reliably announce
  // that it is finished, so the manager needs a way to re-ask without reloading.
  async function recheckConnectStatus() {
    setConnectReady('checking');
    setConnectReady(await fetchConnectStatus());
  }

  /**
   * Creates everything on our side (group, establishment, roles) and moves to
   * the Connect step.
   *
   * This used to be the end of the wizard. It is now the second-to-last act:
   * onboarding is not complete until Stripe has the establishment's details,
   * which `handleFinish` verifies.
   */
  async function provisionThenAdvance() {
    // Re-entrant guard: the Connect step is reachable by browser back, and a
    // second run would create a duplicate group in scan mode.
    if (provisioned) {
      goTo('connect');
      return;
    }
    if (provisioning) return;

    setProvisioning(true);
    setSubmitting(true);
    setError(null);

    try {
    if (mode === 'scan') {
      // 1. Create the Supabase account client-side, unless a previous attempt
      //    already did (see createdUserId).
      let userId = createdUserId.current;
      if (!userId) {
        const supabase = createClient();
        const redirectTo = `${getBaseUrl()}/auth/callback?next=${encodeURIComponent(`/${locale}/login?verified=true`)}`;
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: state.adminEmail,
          password: state.password,
          options: {
            data: { full_name: state.adminFullName },
            emailRedirectTo: redirectTo,
          },
        });

        if (signUpErr || !signUpData.user) {
          setError(signUpErr ? mapAuthError(signUpErr.message, tAuth) : tAuth('errorGeneric'));
          setSubmitting(false);
          setProvisioning(false);
          return;
        }
        userId = signUpData.user.id;
        createdUserId.current = userId;
      }

      // 2. Call server action — passes userId so it works even before email confirmation
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

      if ('error' in result) {
        // A SmartTag already attached to someone else is not something the
        // manager can fix from here: the tag id comes from the URL the sticker
        // itself points at, and there is no longer a step that lets one be
        // typed in. The message says to get in touch, which is the only real
        // remedy, so it stays on the step the click came from.
        setError(result.error);
        setSubmitting(false);
        setProvisioning(false);
        return;
      }

      // Stay signed in through the Connect step; the sign-out that used to
      // happen here now waits until handleFinish, so the embedded component
      // has a session (and, as a fallback, the signed token below).
      setProvisioned({
        establishmentId: result.establishmentId,
        onboardingToken: result.onboardingToken,
      });
    } else if (mode === 'express') {
      // Express flow: account created here, group already exists in DB
      let userId = createdUserId.current;
      if (!userId) {
        const supabase = createClient();
        const redirectTo = `${getBaseUrl()}/auth/callback?next=${encodeURIComponent(`/${locale}/login?verified=true`)}`;
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: state.adminEmail,
          password: state.password,
          options: {
            data: { full_name: state.adminFullName },
            emailRedirectTo: redirectTo,
          },
        });

        if (signUpErr) {
          setError(mapAuthError(signUpErr.message, tAuth));
          setSubmitting(false);
          setProvisioning(false);
          return;
        }
        userId = signUpData.user?.id ?? null;
        createdUserId.current = userId;
      }

      // Run the express onboarding action up-front so the group_admin role is
      // attached to the new auth user even when email confirmation defers the
      // session. Otherwise the user logs in later with no role at all.
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
        userId: userId ?? undefined,
      });

      if ('error' in result) {
        setError(result.error);
        setSubmitting(false);
        setProvisioning(false);
        return;
      }

      setProvisioned({
        establishmentId: result.establishmentId,
        onboardingToken: result.onboardingToken,
      });
    } else {
      const result = await completePostPurchaseOnboarding({
        establishmentName: state.establishmentName,
        address: state.address,
        googlePlaceId: state.googlePlaceId || undefined,
        googleReviewUrl: state.googleReviewUrl || undefined,
        adminFullName: state.adminFullName,
        businessType: state.businessType,
        locale: locale as 'fr' | 'en',
      });

      if ('error' in result) {
        setError(result.error);
        setSubmitting(false);
        setProvisioning(false);
        return;
      }

      setProvisioned({ establishmentId: result.establishmentId });
    }

    setSubmitting(false);
    setProvisioning(false);
    goTo('connect');
    } catch (err) {
      // Without this, a thrown error (server action 500, network failure)
      // would leave the button stuck on "Finalisation…" forever.
      console.error('onboarding provisioning failed', err);
      setError(tAuth('errorGeneric'));
      setSubmitting(false);
      setProvisioning(false);
    }
  }

  /**
   * Closes the wizard, but only if Stripe confirms the establishment submitted
   * its onboarding details. The server re-reads the account rather than
   * trusting anything the browser claims about it.
   */
  async function handleFinish() {
    if (!provisioned) return;
    setSubmitting(true);
    setError(null);

    try {
      const result = await finalizeOnboarding({
        establishmentId: provisioned.establishmentId,
        token: provisioned.onboardingToken,
      });

      if ('error' in result) {
        setError(result.code === 'connect_incomplete' ? t('connect.incomplete') : result.error);
        setSubmitting(false);
        return;
      }

      trackEvent('onboarding_submitted', {
        mode,
        payoutsEnabled: result.payoutsEnabled,
      });

      // Scan and express both created the account here, so the user is signed
      // in but unconfirmed. Sign them out and tell them to check their inbox.
      if (mode === 'scan' || mode === 'express') {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (data.session) await supabase.auth.signOut();
        setNeedsEmailVerification(true);
      }

      setPayoutsPending(!result.chargesEnabled || !result.payoutsEnabled);
      setDone(true);
      setSubmitting(false);
    } catch (err) {
      console.error('onboarding finalize failed', err);
      setError(tAuth('errorGeneric'));
      setSubmitting(false);
    }
  }

  // ─── Done screen ───────────────────────────────────────────────────────────

  if (done) {
    if (needsEmailVerification) {
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
            background: 'var(--surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: 28,
          }}>
            ✉
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 10 }}>
            {t('emailVerification.title')}
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-3)', lineHeight: 1.7, marginBottom: 12 }}>
            {t.rich('emailVerification.sent', {
              email: state.adminEmail,
              strong: (c) => <strong style={{ color: 'var(--text)' }}>{c}</strong>,
            })}
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7 }}>
            {t.rich('emailVerification.activate', {
              name: state.establishmentName,
              strong: (c) => <strong style={{ color: 'var(--text)' }}>{c}</strong>,
            })}
          </p>
        </div>
      );
    }

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
        {/* Stripe accepted the form but is still verifying: the wizard is over,
            the tip pages just stay closed until charges and payouts light up.
            Nothing is asked of the manager — say so, so they don't go hunting
            for a step they missed. */}
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
        {/* Payouts are configured during the wizard now, so there is no
            leftover banking step to send anyone to — the dashboard is the
            destination in every mode. */}
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
    'admin-name': 'adminName', email: 'email', password: 'password', connect: 'connect',
  };
  const i18nKey = STEP_I18N[currentStep];
  const config = i18nKey
    ? { title: t(`${i18nKey}.title`), subtitle: t(`${i18nKey}.subtitle`) }
    : { title: '', subtitle: '' };
  // Connect is mandatory for everyone, so it is always the final step.
  const isLastStep = stepIndex === steps.length - 1;
  const totalSteps = steps.length;
  // Google review is soft-required: the primary CTA stays disabled until a link
  // is chosen, but a discreet skip link lets the manager move on.
  const reviewBlocking = currentStep === 'google-review' && state.googleReviewUrl.trim().length === 0;
  // The confirmation screen carries three fields and their labels; at the
  // default header size it fell below the fold on a phone, so the header gives
  // up the difference. See the header comment below.
  const dense = currentStep === 'confirm';
  // Stripe has not been told enough yet — finishing would only earn a rejection
  // from finalizeOnboarding, so the button says so instead of inviting the click.
  const connectBlocking =
    currentStep === 'connect' &&
    (!legalForm || connectReady === 'incomplete' || connectReady === 'checking');

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

      case 'email':
        return (
          <input
            autoFocus
            type="email"
            value={state.adminEmail}
            onChange={(e) => dispatch({ adminEmail: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && canAdvance() && next()}
            style={inp}
          />
        );

      case 'password':
        return (
          <div>
            <input
              autoFocus
              type="password"
              value={state.password}
              onChange={(e) => dispatch({ password: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && canAdvance() && (isLastStep ? handleFinish() : next())}
              style={inp}
            />
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 8 }}>{t('password.hint')}</p>
          </div>
        );

      case 'connect':
        // Everything above this step only wrote rows in our own database. This
        // one is where the establishment actually becomes able to receive
        // money, and it is deliberately blocking: `handleFinish` asks Stripe
        // whether the form was really submitted before completing onboarding.
        return (
          <div>
            <div style={{
              display: 'flex', gap: 12, padding: '16px', marginBottom: 16,
              borderRadius: 12, background: 'var(--surface-2)',
              border: '1px solid var(--border-subtle)',
            }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>🔒</span>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65 }}>
                {t.rich('connect.body', {
                  name: state.establishmentName,
                  b: (c) => <strong style={{ color: 'var(--text)' }}>{c}</strong>,
                })}
              </div>
            </div>

            {provisioning && (
              <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '24px 0' }}>
                {t('connect.preparing')}
              </div>
            )}

            {provisioned && !legalForm && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
                  {t('connect.legalTitle')}
                </div>
                {[
                  { value: 'company' as const, label: t('connect.legalCompany'), icon: '🏢' },
                  { value: 'individual' as const, label: t('connect.legalIndividual'), icon: '🧑‍🍳' },
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
            )}

            {provisioned && legalForm && (
              <EstablishmentOnboarding
                establishmentId={provisioned.establishmentId}
                token={provisioned.onboardingToken}
                legalForm={legalForm}
                onExit={() => setConnectExited(true)}
                errorFallback={
                  <div style={{ fontSize: 13, color: 'var(--error)', lineHeight: 1.6 }}>
                    {t('connect.loadFailed')}
                  </div>
                }
              />
            )}

            {connectExited && connectReady !== 'incomplete' && connectReady !== 'checking' && (
              <p style={{
                marginTop: 14, fontSize: 12.5, color: 'var(--text-3)',
                textAlign: 'center', lineHeight: 1.6,
              }}>
                {t('connect.exited')}
              </p>
            )}
          </div>
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
        {isLastStep ? (
          <>
            <button
              type="button"
              onClick={() => handleFinish()}
              disabled={submitting || !canAdvance() || connectBlocking}
              style={{
                ...btnPrimary,
                opacity: (submitting || !canAdvance() || connectBlocking) ? 0.5 : 1,
                cursor: connectBlocking ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? t('finishing') : t('finish')}
            </button>

            {currentStep === 'connect' && legalForm && connectReady === 'checking' && (
              <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', margin: 0 }}>
                {t('connect.checking')}
              </p>
            )}

            {currentStep === 'connect' && legalForm && connectReady === 'incomplete' && (
              <>
                <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', margin: 0 }}>
                  {t('connect.incompleteHint')}
                </p>
                {/* The embedded form does not always announce that it is done,
                    so there has to be a way to re-ask without reloading. */}
                <button
                  type="button"
                  onClick={() => void recheckConnectStatus()}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-3)',
                    fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
                    textDecoration: 'underline', textUnderlineOffset: 3,
                    textAlign: 'center', padding: 0,
                  }}
                >
                  {t('connect.recheck')}
                </button>
              </>
            )}
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
        {!canAdvance() && !submitting && (
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

        {/* No way back out of the Connect step. Everything the earlier steps
            collected has already been written by the time it is reached, and
            provisionThenAdvance short-circuits on the second pass — so going
            back, editing, and coming forward again silently discards the edit.
            An exit that quietly loses work is worse than no exit. */}
        {stepIndex > 0 && currentStep !== 'connect' && (
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
