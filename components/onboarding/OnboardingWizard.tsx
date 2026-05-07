'use client';

import { useCallback, useReducer, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  completePostPurchaseOnboarding,
  completeNfcOnboarding,
  completeExpressOnboarding,
} from '@/actions/onboarding';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Colleague {
  fullName: string;
  email: string;
}

interface WizardState {
  nfcCodes: string[];
  establishmentName: string;
  address: string;
  adminFullName: string;
  adminEmail: string;
  password: string;
  colleagues: Colleague[];
}

type ScanStep = 'codes' | 'salon' | 'address' | 'admin-name' | 'email' | 'password' | 'team';
type AuthStep = 'salon' | 'address' | 'admin-name' | 'team';
type ExpressStep = 'salon' | 'address' | 'admin-name' | 'email' | 'password' | 'team';

const SCAN_STEPS: ScanStep[] = ['codes', 'salon', 'address', 'admin-name', 'email', 'password', 'team'];
const AUTH_STEPS: AuthStep[] = ['salon', 'address', 'admin-name', 'team'];
const EXPRESS_STEPS: ExpressStep[] = ['salon', 'address', 'admin-name', 'email', 'password', 'team'];

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
        setCodeError('Code invalide ou déjà utilisé');
        setValidating(false);
        return;
      }
      onChange([...codes, c]);
      setInputVal('');
    } catch {
      setCodeError('Erreur de validation, réessayez.');
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
          placeholder="ex: a3f2b9c1"
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
          {validating ? '…' : 'Ajouter'}
        </button>
      </div>

      {codeError && (
        <p style={{ fontSize: 13, color: 'var(--error)', marginTop: 8 }}>{codeError}</p>
      )}

      <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 14, lineHeight: 1.6 }}>
        Les codes se trouvent sous le QR code imprimé sur chaque SmartTag.
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
  const add = () => onChange([...colleagues, { fullName: '', email: '' }]);
  const remove = (i: number) => onChange(colleagues.filter((_, j) => j !== i));
  const update = (i: number, patch: Partial<Colleague>) =>
    onChange(colleagues.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div>
      <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.6 }}>
        Vos collègues recevront un email pour créer leur compte et commencer à recevoir des pourboires.
        Vous pouvez passer cette étape et les inviter plus tard depuis votre dashboard.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {colleagues.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                placeholder="Prénom du collègue"
                value={c.fullName}
                onChange={(e) => update(i, { fullName: e.target.value })}
                style={{ ...inp, fontSize: 14, padding: '11px 14px' }}
              />
              <input
                type="email"
                placeholder="Email du collègue"
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
              Retirer
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
        + Ajouter un collègue
      </button>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function OnboardingWizard(props: Props) {
  const { mode, locale } = props;
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

  const goTo = useCallback(
    (step: string) => {
      setError(null);
      const p = new URLSearchParams(searchParams.toString());
      p.set('step', step);
      router.replace(`/${locale}/onboarding?${p.toString()}`, { scroll: false });
    },
    [router, locale, searchParams]
  );

  const next = () => {
    const s = steps[stepIndex + 1];
    if (s) goTo(s);
  };

  const back = () => {
    const s = steps[stepIndex - 1];
    if (s) goTo(s);
  };

  const canAdvance = (): boolean => {
    switch (currentStep) {
      case 'codes':
        return state.nfcCodes.length > 0;
      case 'salon':
        return state.establishmentName.trim().length > 0;
      case 'address':
        return state.address.trim().length > 0;
      case 'admin-name':
        return state.adminFullName.trim().length > 0;
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.adminEmail);
      case 'password':
        return state.password.length >= 8;
      case 'team':
        return true;
      default:
        return true;
    }
  };

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    if (mode === 'scan') {
      // 1. Create Supabase account client-side with emailRedirectTo so the
      //    verification link lands on the login page with a success banner.
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent(`/${locale}/auth/login?verified=true`)}`;
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: state.adminEmail,
        password: state.password,
        options: {
          data: { full_name: state.adminFullName },
          emailRedirectTo: redirectTo,
        },
      });

      if (signUpErr) {
        setError(signUpErr.message);
        setSubmitting(false);
        return;
      }

      if (!signUpData.session) {
        // Email confirmation required — cannot run server action without a session.
        setNeedsEmailVerification(true);
        setDone(true);
        setSubmitting(false);
        return;
      }


      // 2. Call server action (session cookie is now set)
      const result = await completeNfcOnboarding({
        nfcCodes: state.nfcCodes,
        establishmentName: state.establishmentName,
        address: state.address,
        adminFullName: state.adminFullName,
        colleagues: state.colleagues.filter((c) => c.fullName.trim() && c.email.trim()),
        locale: locale as 'fr' | 'en',
      });

      if ('error' in result) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      // 3. Sign out — user must verify email before accessing dashboard
      await supabase.auth.signOut();
      setNeedsEmailVerification(true);
    } else if (mode === 'express') {
      // Express flow: account created here, group already exists in DB
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent(`/${locale}/auth/login?verified=true`)}`;
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: state.adminEmail,
        password: state.password,
        options: {
          data: { full_name: state.adminFullName },
          emailRedirectTo: redirectTo,
        },
      });

      if (signUpErr) {
        // Email already registered → ask them to log in instead
        if (signUpErr.message.toLowerCase().includes('already') || signUpErr.status === 400) {
          setError('Un compte existe déjà avec cet email. Connectez-vous sur digitip.app/login pour accéder à votre espace.');
        } else {
          setError(signUpErr.message);
        }
        setSubmitting(false);
        return;
      }

      if (!signUpData.session) {
        setNeedsEmailVerification(true);
        setDone(true);
        setSubmitting(false);
        return;
      }

      const result = await completeExpressOnboarding({
        groupId: props.groupId,
        establishmentName: state.establishmentName,
        address: state.address,
        adminFullName: state.adminFullName,
        colleagues: state.colleagues.filter((c) => c.fullName.trim() && c.email.trim()),
        locale: locale as 'fr' | 'en',
      });

      if ('error' in result) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      await supabase.auth.signOut();
      setNeedsEmailVerification(true);
    } else {
      const result = await completePostPurchaseOnboarding({
        establishmentName: state.establishmentName,
        address: state.address,
        adminFullName: state.adminFullName,
        colleagues: state.colleagues.filter((c) => c.fullName.trim() && c.email.trim()),
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
            Vérifiez votre email
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-3)', lineHeight: 1.7, marginBottom: 12 }}>
            Un lien de confirmation a été envoyé à <strong style={{ color: 'var(--text)' }}>{state.adminEmail}</strong>.
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7 }}>
            Cliquez dessus pour activer votre compte et accéder à votre espace <strong style={{ color: 'var(--text)' }}>{state.establishmentName}</strong>.
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
          Votre espace est prêt !
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-3)', lineHeight: 1.7, marginBottom: 32 }}>
          {state.establishmentName} est configuré. Vous pouvez maintenant gérer votre équipe et suivre vos pourboires.
        </p>
        <button
          onClick={() => router.push(`/${locale}/dashboard`)}
          style={{ ...btnPrimary, maxWidth: 320, margin: '0 auto', display: 'block' }}
        >
          Accéder au dashboard →
        </button>
      </div>
    );
  }

  // ─── Step content ──────────────────────────────────────────────────────────

  const stepConfig: Record<string, { title: string; subtitle: string }> = {
    codes: {
      title: 'Vos SmartTags',
      subtitle: 'Votre SmartTag est prêt à être configuré. Avez-vous d\'autres tags à associer maintenant ?',
    },
    salon: {
      title: 'Nom du salon',
      subtitle: 'Comment s\'appelle votre salon ou établissement ?',
    },
    address: {
      title: 'Adresse',
      subtitle: 'À quelle adresse se trouve votre établissement ?',
    },
    'admin-name': {
      title: 'Votre nom',
      subtitle: 'Comment vous appelez-vous ?',
    },
    email: {
      title: 'Votre email',
      subtitle: 'Vous recevrez vos notifications et votre lien de connexion ici.',
    },
    password: {
      title: 'Mot de passe',
      subtitle: 'Choisissez un mot de passe sécurisé.',
    },
    team: {
      title: 'Votre équipe',
      subtitle: 'Invitez vos collègues pour qu\'ils puissent eux aussi recevoir des pourboires.',
    },
  };

  const config = stepConfig[currentStep] ?? { title: '', subtitle: '' };
  const isLastStep = stepIndex === steps.length - 1;
  const totalSteps = steps.length;

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
          <textarea
            autoFocus
            value={state.address}
            onChange={(e) => dispatch({ address: e.target.value })}
            rows={3}
            style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }}
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
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 8 }}>8 caractères minimum</p>
          </div>
        );

      case 'team':
        return (
          <StepTeamContent
            colleagues={state.colleagues}
            onChange={(colleagues) => dispatch({ colleagues })}
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
        Étape {stepIndex + 1} sur {totalSteps}
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
            onClick={handleSubmit}
            disabled={submitting}
            style={{ ...btnPrimary, opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Finalisation…' : 'Terminer la configuration →'}
          </button>
        ) : (
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance()}
            style={{ ...btnPrimary, opacity: canAdvance() ? 1 : 0.4 }}
          >
            Continuer →
          </button>
        )}

        {/* "Skip" for team step */}
        {currentStep === 'team' && !isLastStep && (
          <button
            type="button"
            onClick={next}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-3)',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'var(--font)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              textAlign: 'center',
            }}
          >
            Passer cette étape
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
            ← Retour
          </button>
        )}
      </div>
    </div>
  );
}
