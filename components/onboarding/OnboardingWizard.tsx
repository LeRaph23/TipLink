'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import {
  completePostPurchaseOnboarding,
  completeNfcOnboarding,
  completeExpressOnboarding,
} from '@/actions/onboarding';
import { AddressAutocomplete } from './AddressAutocomplete';
import { GoogleReviewPicker } from './GoogleReviewPicker';
import { getBaseUrl } from '@/lib/env';
import { mapAuthError } from '@/lib/auth/map-auth-error';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Colleague {
  fullName: string;
  email: string; // optional — empty string means no email invite
}

interface WizardState {
  nfcCodes: string[];
  establishmentName: string;
  address: string;
  googlePlaceId: string;
  googleReviewUrl: string;
  adminFullName: string;
  adminEmail: string;
  password: string;
  colleagues: Colleague[];
}

type ScanStep = 'codes' | 'salon' | 'address' | 'google-review' | 'admin-name' | 'email' | 'password' | 'team' | 'tips-opt-in' | 'banking';
type AuthStep = 'salon' | 'address' | 'google-review' | 'admin-name' | 'team' | 'tips-opt-in' | 'banking';
type ExpressStep = 'salon' | 'address' | 'google-review' | 'admin-name' | 'email' | 'password' | 'team' | 'tips-opt-in' | 'banking';

const SCAN_STEPS: ScanStep[] = ['codes', 'salon', 'address', 'google-review', 'admin-name', 'email', 'password', 'team', 'tips-opt-in', 'banking'];
const AUTH_STEPS: AuthStep[] = ['salon', 'address', 'google-review', 'admin-name', 'team', 'tips-opt-in', 'banking'];
const EXPRESS_STEPS: ExpressStep[] = ['salon', 'address', 'google-review', 'admin-name', 'email', 'password', 'team', 'tips-opt-in', 'banking'];

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

function StepCodesContent({
  codes,
  onChange,
}: {
  codes: string[];
  onChange: (codes: string[]) => void;
}) {
  const t = useTranslations('onboarding.codes');
  const [inputVal, setInputVal] = useState('');
  const [validating, setValidating] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  async function addCode() {
    const c = inputVal.trim().toLowerCase();
    if (!c) return;
    if (codes.includes(c)) {
      setInputVal('');
      return;
    }
    setValidating(true);
    setCodeError(null);
    try {
      const res = await fetch(`/api/onboarding/validate-code?code=${encodeURIComponent(c)}`);
      const { valid } = (await res.json()) as { valid: boolean };
      if (!valid) {
        setCodeError(t('invalidCode'));
        setValidating(false);
        return;
      }
      onChange([...codes, c]);
      setInputVal('');
    } catch (err) {
      // Distinguish a network failure from a genuinely invalid code so the
      // user doesn't think a valid tag was rejected.
      console.error('[onboarding] code validation failed', err);
      setCodeError(t('networkError'));
    }
    setValidating(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {codes.map((c, i) => (
          <div
            key={c}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 14px',
              borderRadius: 999,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              fontFamily: 'monospace',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            {c}
            {i > 0 && (
              <button
                type="button"
                onClick={() => onChange(codes.filter((_, j) => j !== i))}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-3)',
                  fontSize: 16,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value.toLowerCase())}
          onKeyDown={(e) => e.key === 'Enter' && addCode()}
          placeholder={t('placeholder')}
          maxLength={32}
          style={{ ...inp, flex: 1 }}
        />
        <button
          type="button"
          onClick={addCode}
          disabled={!inputVal.trim() || validating}
          style={{
            ...btnSecondary,
            whiteSpace: 'nowrap',
            opacity: !inputVal.trim() || validating ? 0.5 : 1,
          }}
        >
          {validating ? t('validating') : t('add')}
        </button>
      </div>

      {codeError && (
        <p style={{ fontSize: 13, color: 'var(--error)', marginTop: 8 }}>{codeError}</p>
      )}

      <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 14, lineHeight: 1.6 }}>
        {t('hint')}
      </p>
    </div>
  );
}

function StepTeamContent({
  colleagues,
  onChange,
}: {
  colleagues: Colleague[];
  onChange: (c: Colleague[]) => void;
}) {
  const t = useTranslations('onboarding.team');
  const add = () => onChange([...colleagues, { fullName: '', email: '' }]);
  const remove = (i: number) => onChange(colleagues.filter((_, j) => j !== i));
  const update = (i: number, patch: Partial<Colleague>) =>
    onChange(colleagues.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div>
      <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.6 }}>
        {t('intro')}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {colleagues.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                placeholder={t('namePlaceholder')}
                value={c.fullName}
                onChange={(e) => update(i, { fullName: e.target.value })}
                style={{ ...inp, fontSize: 14, padding: '11px 14px' }}
              />
              <input
                type="email"
                placeholder={t('emailPlaceholder')}
                value={c.email}
                onChange={(e) => update(i, { email: e.target.value })}
                style={{ ...inp, fontSize: 14, padding: '11px 14px' }}
              />
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              style={{
                marginTop: 4,
                padding: '11px 14px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'none',
                color: 'var(--text-3)',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              {t('remove')}
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        style={{
          marginTop: 14,
          padding: '10px 16px',
          borderRadius: 10,
          border: '1px dashed var(--border)',
          background: 'none',
          color: 'var(--text-2)',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'var(--font)',
          width: '100%',
        }}
      >
        {t('add')}
      </button>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

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
      address: props.establishment?.address ?? '',
      googlePlaceId: '',
      googleReviewUrl: '',
      adminFullName: '',
      adminEmail: mode === 'express' ? props.initialEmail : '',
      password: '',
      colleagues: [],
    }
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);

  // Whether the admin wants to receive tips personally (tips-opt-in step).
  // Banking itself is set up afterwards on the dashboard, via Stripe.
  const [wantsTips, setWantsTips] = useState<boolean | null>(null);

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
        // Every code must be a non-empty string — the server schema rejects ''.
        case 'codes': return state.nfcCodes.length > 0 && state.nfcCodes.every((c) => c.trim().length > 0);
        case 'salon': return state.establishmentName.trim().length > 0;
        case 'address': return state.address.trim().length > 0;
        // Soft-required: never blocks navigation (a discreet "skip" link exists),
        // so the bounce-back guard treats it as satisfied.
        case 'google-review': return true;
        case 'admin-name': return state.adminFullName.trim().length > 0;
        case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.adminEmail);
        case 'password': return state.password.length >= 8;
        case 'team': return true;
        case 'tips-opt-in': return wantsTips !== null;
        case 'banking': return true;
        default: return true;
      }
    },
    [state, wantsTips]
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

  // In postpurchase mode, skip banking step if admin said no
  const next = () => {
    let nextIdx = stepIndex + 1;
    const s = steps[nextIdx];
    // Skip 'banking' if wantsTips is false
    if (s === 'banking' && wantsTips === false) {
      nextIdx += 1;
      const s2 = steps[nextIdx];
      if (s2) goTo(s2);
      return;
    }
    if (s) goTo(s);
  };

  const back = () => {
    let prevIdx = stepIndex - 1;
    const s = steps[prevIdx];
    // Skip 'banking' going backwards if wantsTips is false
    if (s === 'banking' && wantsTips === false) {
      prevIdx -= 1;
      const s2 = steps[prevIdx];
      if (s2) goTo(s2);
      return;
    }
    if (s) goTo(s);
  };

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    try {
    if (mode === 'scan') {
      // 1. Create Supabase account client-side
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
        return;
      }

      // 2. Call server action — passes userId so it works even before email confirmation
      const result = await completeNfcOnboarding({
        userId: signUpData.user.id,
        nfcCodes: state.nfcCodes,
        establishmentName: state.establishmentName,
        address: state.address,
        googlePlaceId: state.googlePlaceId || undefined,
        googleReviewUrl: state.googleReviewUrl || undefined,
        adminFullName: state.adminFullName,
        colleagues: state.colleagues.filter((c) => c.fullName.trim()),
        locale: locale as 'fr' | 'en',
      });

      if ('error' in result) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      setNeedsEmailVerification(true);
      if (signUpData.session) await supabase.auth.signOut();
    } else if (mode === 'express') {
      // Express flow: account created here, group already exists in DB
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
        return;
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
        colleagues: state.colleagues.filter((c) => c.fullName.trim()),
        locale: locale as 'fr' | 'en',
        userId: signUpData.user?.id,
      });

      if ('error' in result) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      if (signUpData.session) await supabase.auth.signOut();
      setNeedsEmailVerification(true);
    } else {
      const result = await completePostPurchaseOnboarding({
        establishmentName: state.establishmentName,
        address: state.address,
        googlePlaceId: state.googlePlaceId || undefined,
        googleReviewUrl: state.googleReviewUrl || undefined,
        adminFullName: state.adminFullName,
        colleagues: state.colleagues.filter((c) => c.fullName.trim()),
        locale: locale as 'fr' | 'en',
      });

      if ('error' in result) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

    }

    setDone(true);
    setSubmitting(false);
    } catch (err) {
      // Without this, a thrown error (server action 500, network failure)
      // would leave the button stuck on "Finalisation…" forever.
      console.error('onboarding submit failed', err);
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
        {wantsTips && (
          <div style={{
            background: 'var(--surface-2)', border: '1px solid rgba(229,122,151,0.25)',
            borderRadius: 12, padding: '12px 16px', marginBottom: 24, textAlign: 'left',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
              {t('done.payoutTitle')}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
              {t.rich('done.payoutBody', { b: (c) => <strong style={{ color: 'var(--text)' }}>{c}</strong> })}
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
    codes: 'codes', salon: 'salon', address: 'address',
    'google-review': 'googleReview',
    'admin-name': 'adminName', email: 'email', password: 'password',
    team: 'team', 'tips-opt-in': 'tipsOptIn', banking: 'banking',
  };
  const i18nKey = STEP_I18N[currentStep];
  const config = i18nKey
    ? { title: t(`${i18nKey}.title`), subtitle: t(`${i18nKey}.subtitle`) }
    : { title: '', subtitle: '' };
  // If admin declined tips, last real step is tips-opt-in (skip banking)
  const effectiveLastIdx = (wantsTips === false)
    ? steps.indexOf('tips-opt-in' as never)
    : steps.length - 1;
  const isLastStep = stepIndex === effectiveLastIdx;
  const totalSteps = steps.length;
  // Google review is soft-required: the primary CTA stays disabled until a link
  // is chosen, but a discreet skip link lets the manager move on.
  const reviewBlocking = currentStep === 'google-review' && state.googleReviewUrl.trim().length === 0;

  function renderStepBody() {
    switch (currentStep) {
      case 'codes':
        return (
          <StepCodesContent
            codes={state.nfcCodes}
            onChange={(nfcCodes) => dispatch({ nfcCodes })}
          />
        );

      case 'salon':
        return (
          <input
            autoFocus
            type="text"
            value={state.establishmentName}
            onChange={(e) => dispatch({ establishmentName: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && canAdvance() && (isLastStep ? handleSubmit() : next())}
            style={inp}
          />
        );

      case 'address':
        return (
          <AddressAutocomplete
            value={state.address}
            onChange={(address) => dispatch({ address })}
            onConfirm={() => canAdvance() && (isLastStep ? handleSubmit() : next())}
            style={inp}
          />
        );

      case 'google-review':
        return (
          <GoogleReviewPicker
            name={state.establishmentName}
            address={state.address}
            value={state.googleReviewUrl}
            placeId={state.googlePlaceId}
            onChange={({ placeId, reviewUrl }) =>
              dispatch({ googlePlaceId: placeId ?? '', googleReviewUrl: reviewUrl })
            }
          />
        );

      case 'admin-name':
        return (
          <input
            autoFocus
            type="text"
            value={state.adminFullName}
            onChange={(e) => dispatch({ adminFullName: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && canAdvance() && (isLastStep ? handleSubmit() : next())}
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
              onKeyDown={(e) => e.key === 'Enter' && canAdvance() && (isLastStep ? handleSubmit() : next())}
              style={inp}
            />
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 8 }}>{t('password.hint')}</p>
          </div>
        );

      case 'team':
        return (
          <StepTeamContent
            colleagues={state.colleagues}
            onChange={(colleagues) => dispatch({ colleagues })}
          />
        );

      case 'tips-opt-in':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { value: true, label: t('tipsOptIn.yes'), icon: '💸' },
              { value: false, label: t('tipsOptIn.no'), icon: '👔' },
            ].map(({ value, label, icon }) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => setWantsTips(value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px 18px', borderRadius: 14,
                  border: `1.5px solid ${wantsTips === value ? 'var(--accent)' : 'var(--border)'}`,
                  background: wantsTips === value ? 'var(--surface-2)' : 'var(--surface)',
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

      case 'banking':
        return (
          <div style={{
            display: 'flex', gap: 12, padding: '16px',
            borderRadius: 12, background: 'var(--surface-2)',
            border: '1px solid var(--border-subtle)',
          }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>🔒</span>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65 }}>
              {t.rich('banking.body', { b: (c) => <strong style={{ color: 'var(--text)' }}>{c}</strong> })}
            </div>
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

      {/* Step header + body */}
      <div key={currentStep} style={{ animation: 'onbSlideIn 220ms ease-out' }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 800,
          color: 'var(--text)',
          letterSpacing: '-0.03em',
          marginBottom: 8,
          lineHeight: 1.2,
        }}>
          {config.title}
        </h1>
        <p style={{
          fontSize: 15,
          color: 'var(--text-3)',
          lineHeight: 1.6,
          marginBottom: 28,
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
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={submitting || !canAdvance()}
            style={{ ...btnPrimary, opacity: (submitting || !canAdvance()) ? 0.5 : 1 }}
          >
            {submitting ? t('finishing') : t('finish')}
          </button>
        ) : (
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance() || reviewBlocking}
            style={{ ...btnPrimary, opacity: (canAdvance() && !reviewBlocking) ? 1 : 0.4 }}
          >
            {t('continue')}
          </button>
        )}

        {/* Explain why the action button is greyed out instead of leaving the
            user guessing. Not shown on steps with no required field. */}
        {!canAdvance() && !submitting && currentStep !== 'tips-opt-in' && (
          <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', margin: 0 }}>
            {t('fillField')}
          </p>
        )}

        {/* Soft-required Google review step: a deliberately small, low-contrast
            "skip" link — we want most managers to set this up, but never trap
            someone who doesn't have their link handy (they can add it later). */}
        {currentStep === 'google-review' && reviewBlocking && (
          <button
            type="button"
            onClick={next}
            style={{
              background: 'none', border: 'none', color: 'var(--text-3)',
              fontSize: 11.5, cursor: 'pointer', fontFamily: 'var(--font)',
              opacity: 0.7, textAlign: 'center', padding: 0, marginTop: 2,
            }}
          >
            {t('googleReview.skip')}
          </button>
        )}

        {/* "Skip" for team step (not last) */}
        {currentStep === 'team' && !isLastStep && (
          <button
            type="button"
            onClick={next}
            style={{
              background: 'none', border: 'none', color: 'var(--text-3)',
              fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
              textDecoration: 'underline', textUnderlineOffset: 3, textAlign: 'center',
            }}
          >
            {t('skip')}
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
