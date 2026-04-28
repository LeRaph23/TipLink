'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PACKS, type PackId } from '@/lib/env';
import {
  emptyOrder,
  parseStep,
  stepIndex,
  STEPS,
  validateShipping,
  validateBilling,
  validateAccount,
  type OrderState,
  type Step,
} from '@/lib/order-validation';
import { OrderLayout } from '@/components/order/OrderLayout';
import { StepPack } from '@/components/order/StepPack';
import { StepShipping } from '@/components/order/StepShipping';
import { StepBilling } from '@/components/order/StepBilling';
import { StepAccount } from '@/components/order/StepAccount';
import { StepReview } from '@/components/order/StepReview';
import { formatPrice } from '@/components/order/OrderSummary';

const STORAGE_KEY = (pack: PackId) => `tiplink.order.${pack}`;

const ContinueBtn = ({ children, onClick, disabled }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button" onClick={onClick} disabled={disabled}
    style={{
      flex: 1,
      padding: '12px 18px', borderRadius: 12,
      background: disabled ? 'var(--surface-2)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      color: disabled ? 'var(--text-3)' : '#fff',
      fontSize: 14, fontWeight: 700,
      border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'var(--font)',
      letterSpacing: '-0.01em',
      boxShadow: disabled ? 'none' : '0 6px 24px rgba(99,102,241,0.35)',
      transition: 'transform 120ms, box-shadow 120ms',
    }}
  >
    {children}
  </button>
);

const BackBtn = ({ onBack, label }: { onBack: () => void; label: string }) => (
  <button
    type="button" onClick={onBack}
    style={{
      padding: '12px 16px', borderRadius: 12,
      background: 'transparent', color: 'var(--text-2)',
      border: '1px solid var(--border)',
      fontSize: 13.5, fontWeight: 500,
      cursor: 'pointer', fontFamily: 'var(--font)',
    }}
  >
    ← {label}
  </button>
);

type Action =
  | { type: 'hydrate'; payload: OrderState }
  | { type: 'setPack'; pack: PackId }
  | { type: 'setShipping'; value: OrderState['shipping'] }
  | { type: 'setBusiness'; value: OrderState['business'] }
  | { type: 'setAccount'; value: OrderState['account'] };

function reducer(state: OrderState, action: Action): OrderState {
  switch (action.type) {
    case 'hydrate': return action.payload;
    case 'setPack': return { ...state, pack: action.pack };
    case 'setShipping': return { ...state, shipping: action.value };
    case 'setBusiness': return { ...state, business: action.value };
    case 'setAccount': return { ...state, account: action.value };
    default: return state;
  }
}

// Max step the user has legitimately reached (for progress-bar click safety).
function maxReachable(state: OrderState): Step {
  if (validateShipping(state)) return 'shipping';
  if (validateBilling(state)) return 'billing';
  if (validateAccount(state)) return 'account';
  return 'review';
}

export function OrderWizard({ pack, locale }: { pack: PackId; locale: string }) {
  const t = useTranslations('order');
  const tErrors = useTranslations('order.errors');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [state, dispatch] = useReducer(reducer, pack, emptyOrder);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentStep = parseStep(searchParams.get('step'));

  // Hydrate from localStorage once
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY(pack)) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<OrderState>;
        dispatch({
          type: 'hydrate',
          payload: {
            ...emptyOrder(pack),
            ...parsed,
            pack, // URL wins
          },
        });
      }
    } catch {
      // ignore corrupted state
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, [pack]);

  // Persist on change (but not before hydration, to avoid wiping storage)
  useEffect(() => {
    if (!hydrated) return;
    try {
      // Never persist the password.
      const persistable = {
        ...state,
        account: { ...state.account, password: '' },
      };
      window.localStorage.setItem(STORAGE_KEY(pack), JSON.stringify(persistable));
    } catch {
      // quota exceeded / private mode — ignore
    }
  }, [state, pack, hydrated]);

  const goToStep = useCallback((s: Step) => {
    setError(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set('step', s);
    router.replace(`/order/${pack}?${params.toString()}`, { scroll: false });
  }, [pack, router, searchParams]);

  // If pack switch in step 1, update URL pack segment
  const handlePackChange = useCallback((p: PackId) => {
    dispatch({ type: 'setPack', pack: p });
    if (p !== pack) {
      // Move state from old storage key to new one
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY(pack));
        if (raw) {
          window.localStorage.setItem(STORAGE_KEY(p), raw);
          window.localStorage.removeItem(STORAGE_KEY(pack));
        }
      } catch { /* ignore */ }
      const params = new URLSearchParams(searchParams.toString());
      router.replace(`/order/${p}?${params.toString()}`, { scroll: false });
    }
  }, [pack, router, searchParams]);

  const handleExit = useCallback(() => {
    if (typeof window === 'undefined') return;
    const confirmed = window.confirm(t('exitConfirm'));
    if (!confirmed) return;
    try { window.localStorage.removeItem(STORAGE_KEY(pack)); } catch { /* ignore */ }
    router.push('/');
  }, [pack, router, t]);

  const validateCurrent = (): string | null => {
    switch (currentStep) {
      case 'pack': return null;
      case 'shipping': return validateShipping(state);
      case 'billing': return validateBilling(state);
      case 'account': return validateAccount(state);
      case 'review': return null;
    }
  };

  const handleContinue = () => {
    const err = validateCurrent();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    const idx = stepIndex(currentStep);
    const next = STEPS[idx + 1];
    if (next) goToStep(next);
  };

  const handleBack = () => {
    setError(null);
    const idx = stepIndex(currentStep);
    const prev = STEPS[idx - 1];
    if (prev) goToStep(prev);
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);

    try {
      const supabase = createClient();
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: state.account.email,
        password: state.account.password,
        options: { data: { full_name: state.account.full_name } },
      });

      if (signUpError) {
        setError(`signup_failed::${signUpError.message}`);
        setSubmitting(false);
        goToStep('account');
        return;
      }

      // Supabase returns a user with empty identities[] when the email is already taken.
      if (signUpData.user && signUpData.user.identities && signUpData.user.identities.length === 0) {
        setError('email_in_use');
        setSubmitting(false);
        goToStep('account');
        return;
      }

      // Email confirmation is enabled and no session was returned → payment would fail.
      if (!signUpData.session) {
        setError('email_confirmation_required');
        setSubmitting(false);
        return;
      }

      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pack: state.pack,
          locale,
          business: {
            legal_name: state.business.legal_name,
            vat_number: state.business.vat_number || null,
            shipping: state.shipping,
            billing_same_as_shipping: state.business.billing_same,
            billing: state.business.billing_same ? undefined : state.business.billing,
          },
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(`checkout_failed::${data.error ?? 'unknown'}`);
        setSubmitting(false);
        return;
      }

      const data = (await res.json()) as { url?: string };
      if (!data.url) {
        setError('checkout_failed::missing_url');
        setSubmitting(false);
        return;
      }

      try { window.localStorage.removeItem(STORAGE_KEY(pack)); } catch { /* ignore */ }
      window.location.href = data.url;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setError(`checkout_failed::${message}`);
      setSubmitting(false);
    }
  };

  const titles: Record<Step, { title: string; subtitle: string }> = {
    pack: { title: t('pack.title'), subtitle: t('pack.subtitle') },
    shipping: { title: t('shipping.title'), subtitle: t('shipping.subtitle') },
    billing: { title: t('billing.title'), subtitle: t('billing.subtitle') },
    account: { title: t('account.title'), subtitle: t('account.subtitle') },
    review: { title: t('review.title'), subtitle: t('review.subtitle') },
  };

  // Render the translated error message
  let errorMessage: string | null = null;
  if (error) {
    if (error.includes('::')) {
      const [key, detail] = error.split('::');
      try {
        errorMessage = tErrors(key as 'signup_failed' | 'checkout_failed', { message: detail ?? '' });
      } catch {
        errorMessage = detail || key;
      }
    } else {
      try {
        errorMessage = tErrors(error as Parameters<typeof tErrors>[0]);
      } catch {
        errorMessage = error;
      }
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 'pack':
        return <StepPack pack={state.pack} locale={locale} onChange={handlePackChange} />;
      case 'shipping':
        return <StepShipping value={state.shipping} onChange={(v) => dispatch({ type: 'setShipping', value: v })} />;
      case 'billing':
        return <StepBilling value={state.business} onChange={(v) => dispatch({ type: 'setBusiness', value: v })} />;
      case 'account':
        return <StepAccount value={state.account} onChange={(v) => dispatch({ type: 'setAccount', value: v })} />;
      case 'review':
        return <StepReview state={state} locale={locale} onEdit={goToStep} />;
    }
  };

  const total = PACKS[state.pack].hardwareAmount;

  const footer = (
    <>
      {errorMessage && (
        <div style={{
          marginBottom: 14,
          padding: '10px 14px', borderRadius: 10,
          background: 'color-mix(in oklch, var(--error) 10%, transparent)',
          border: '1px solid color-mix(in oklch, var(--error) 35%, transparent)',
          color: 'var(--error)',
          fontSize: 13, fontWeight: 500, lineHeight: 1.5,
        }}>
          {errorMessage}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        {currentStep !== 'pack' && <BackBtn onBack={handleBack} label={t('back')} />}
        {currentStep !== 'review' ? (
          <ContinueBtn onClick={handleContinue}>
            {t('continue')} →
          </ContinueBtn>
        ) : (
          <ContinueBtn onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? t('redirecting')
              : t('payAmount', { amount: formatPrice(total, locale) })}
          </ContinueBtn>
        )}
      </div>
    </>
  );

  const showSummary = currentStep !== 'pack';

  return (
    <OrderLayout
      pack={state.pack}
      locale={locale}
      step={currentStep}
      reachable={maxReachable(state)}
      title={titles[currentStep].title}
      subtitle={titles[currentStep].subtitle}
      footer={footer}
      onStepClick={goToStep}
      onExit={handleExit}
      showSummary={showSummary}
    >
      {renderStep()}
    </OrderLayout>
  );
}
