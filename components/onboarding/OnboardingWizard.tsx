'use client';

import { useCallback, useReducer, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  completePostPurchaseOnboarding,
  completeNfcOnboarding,
  completeExpressOnboarding,
} from '@/actions/onboarding';
import { setupAdminPayments } from '@/actions/stripe';
import type { BankingData } from '@/actions/stripe';
import { AddressAutocomplete } from './AddressAutocomplete';
import { getBaseUrl } from '@/lib/env';
import { validateIban, formatIbanFriendly } from '@/lib/banking/iban';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Colleague {
  fullName: string;
  email: string; // optional — empty string means no email invite
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

type ScanStep = 'codes' | 'salon' | 'address' | 'admin-name' | 'email' | 'password' | 'team' | 'tips-opt-in' | 'banking';
type AuthStep = 'salon' | 'address' | 'admin-name' | 'team' | 'tips-opt-in' | 'banking';
type ExpressStep = 'salon' | 'address' | 'admin-name' | 'email' | 'password' | 'team' | 'tips-opt-in' | 'banking';

const SCAN_STEPS: ScanStep[] = ['codes', 'salon', 'address', 'admin-name', 'email', 'password', 'team', 'tips-opt-in', 'banking'];
const AUTH_STEPS: AuthStep[] = ['salon', 'address', 'admin-name', 'team', 'tips-opt-in', 'banking'];
const EXPRESS_STEPS: ExpressStep[] = ['salon', 'address', 'admin-name', 'email', 'password', 'team', 'tips-opt-in', 'banking'];

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
  const [bankingConfigured, setBankingConfigured] = useState(false);

  // Banking state (tips-opt-in + banking steps, postpurchase mode only)
  const [wantsTips, setWantsTips] = useState<boolean | null>(null);
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [bankingAddress, setBankingAddress] = useState('');
  const [iban, setIban] = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);

  const ibanValidation = validateIban(iban);
  const bankingFilled = dobDay && dobMonth && dobYear && bankingAddress.trim() && ibanValidation.ok && tosAccepted;

  const goTo = useCallback(
    (step: string) => {
      setError(null);
      const p = new URLSearchParams(searchParams.toString());
      p.set('step', step);
      router.replace(`/${locale}/onboarding?${p.toString()}`, { scroll: false });
    },
    [router, locale, searchParams]
  );

  const canAdvance = (): boolean => {
    switch (currentStep) {
      case 'codes': return state.nfcCodes.length > 0;
      case 'salon': return state.establishmentName.trim().length > 0;
      case 'address': return state.address.trim().length > 0;
      case 'admin-name': return state.adminFullName.trim().length > 0;
      case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.adminEmail);
      case 'password': return state.password.length >= 8;
      case 'team': return true;
      case 'tips-opt-in': return wantsTips !== null;
      case 'banking': return !!bankingFilled;
      default: return true;
    }
  };

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

  async function attemptBankingSetup(): Promise<{ ok: boolean; bankingErr?: string }> {
    if (!wantsTips || !bankingFilled) return { ok: true };

    const commaIdx = bankingAddress.lastIndexOf(',');
    const line1 = commaIdx !== -1 ? bankingAddress.slice(0, commaIdx).trim() : bankingAddress;
    const rest = commaIdx !== -1 ? bankingAddress.slice(commaIdx + 1).trim() : '';
    const spaceIdx = rest.indexOf(' ');
    const postal_code = spaceIdx !== -1 ? rest.slice(0, spaceIdx).trim() : '';
    const city = spaceIdx !== -1 ? rest.slice(spaceIdx + 1).trim() : rest;
    const nameParts = state.adminFullName.trim().split(/\s+/);

    const bankResult = await setupAdminPayments({
      firstName: nameParts[0] ?? state.adminFullName,
      lastName: nameParts.slice(1).join(' ') || (nameParts[0] ?? ''),
      dob: { day: Number(dobDay), month: Number(dobMonth), year: Number(dobYear) },
      address: { line1, city, postal_code, country: 'FR' },
      iban: ibanValidation.ok ? ibanValidation.normalized : iban.replace(/\s/g, '').toUpperCase(),
      tosTimestamp: Math.floor(Date.now() / 1000),
    } as Parameters<typeof setupAdminPayments>[0]);

    if ('error' in bankResult) return { ok: false, bankingErr: bankResult.error };
    setBankingConfigured(true);
    return { ok: true };
  }

  async function handleSubmit(opts?: { skipBankingSetup?: boolean }) {
    setSubmitting(true);
    setError(null);

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
        setError(signUpErr?.message ?? 'Erreur lors de la création du compte.');
        setSubmitting(false);
        return;
      }

      // 2. Call server action — passes userId so it works even before email confirmation
      const result = await completeNfcOnboarding({
        userId: signUpData.user.id,
        nfcCodes: state.nfcCodes,
        establishmentName: state.establishmentName,
        address: state.address,
        adminFullName: state.adminFullName,
        colleagues: state.colleagues.filter((c) => c.fullName.trim()),
        locale: locale as 'fr' | 'en',
      });

      if ('error' in result) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      // 3. If session exists (email auto-confirmed), set up banking before signing out
      if (signUpData.session && !opts?.skipBankingSetup) {
        const { ok, bankingErr } = await attemptBankingSetup();
        if (!ok) {
          setError(bankingErr ?? 'Erreur bancaire');
          setSubmitting(false);
          return;
        }
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
        if (signUpErr.message.toLowerCase().includes('already') || signUpErr.status === 400) {
          setError('Un compte existe déjà avec cet email. Connectez-vous sur digitip.app/login pour accéder à votre espace.');
        } else {
          setError(signUpErr.message);
        }
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

      // Banking setup needs an authenticated session; skip it when email
      // confirmation is pending — the user will be prompted after login.
      if (signUpData.session && !opts?.skipBankingSetup) {
        const { ok, bankingErr } = await attemptBankingSetup();
        if (!ok) {
          setError(bankingErr ?? 'Erreur bancaire');
          setSubmitting(false);
          return;
        }
      }

      if (signUpData.session) await supabase.auth.signOut();
      setNeedsEmailVerification(true);
    } else {
      const result = await completePostPurchaseOnboarding({
        establishmentName: state.establishmentName,
        address: state.address,
        adminFullName: state.adminFullName,
        colleagues: state.colleagues.filter((c) => c.fullName.trim()),
        locale: locale as 'fr' | 'en',
      });

      if ('error' in result) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      if (!opts?.skipBankingSetup) {
        const { ok, bankingErr } = await attemptBankingSetup();
        if (!ok) {
          setError(bankingErr ?? 'Erreur bancaire');
          setSubmitting(false);
          return;
        }
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
        <p style={{ fontSize: 15, color: 'var(--text-3)', lineHeight: 1.7, marginBottom: 24 }}>
          {state.establishmentName} est configuré. Vous pouvez maintenant gérer votre équipe et suivre vos pourboires.
        </p>
        {bankingConfigured && (
          <div style={{
            background: 'var(--success-bg)', border: '1px solid rgba(0,180,100,0.2)',
            borderRadius: 12, padding: '12px 16px', marginBottom: 24, textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>✓</span>
            <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
              Compte bancaire configuré — vous recevrez vos pourboires directement.
            </div>
          </div>
        )}
        {wantsTips && !bankingConfigured && (
          <div style={{
            background: 'var(--surface-2)', border: '1px solid rgba(229,122,151,0.25)',
            borderRadius: 12, padding: '12px 16px', marginBottom: 24, textAlign: 'left',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
              💳 Finalisez vos virements
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
              Après avoir confirmé votre email, rendez-vous dans{' '}
              <strong style={{ color: 'var(--text)' }}>Dashboard → Virements</strong>{' '}
              pour renseigner votre IBAN et commencer à recevoir des pourboires.
            </div>
          </div>
        )}
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
    'tips-opt-in': {
      title: 'Et vous ?',
      subtitle: 'Souhaitez-vous aussi recevoir des pourboires personnellement ?',
    },
    banking: {
      title: 'Vos informations bancaires',
      subtitle: 'Pour virer vos pourboires directement sur votre compte. Votre IBAN ne sera jamais visible par votre équipe.',
    },
  };

  const config = stepConfig[currentStep] ?? { title: '', subtitle: '' };
  // If admin declined tips, last real step is tips-opt-in (skip banking)
  const effectiveLastIdx = (wantsTips === false)
    ? steps.indexOf('tips-opt-in' as never)
    : steps.length - 1;
  const isLastStep = stepIndex === effectiveLastIdx;
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
          <AddressAutocomplete
            value={state.address}
            onChange={(address) => dispatch({ address })}
            onConfirm={() => canAdvance() && (isLastStep ? handleSubmit() : next())}
            style={inp}
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

      case 'tips-opt-in':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { value: true, label: 'Oui, je veux recevoir des pourboires', icon: '💸' },
              { value: false, label: 'Non, je gère uniquement mon équipe', icon: '👔' },
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

      case 'banking': {
        const selectStyle: React.CSSProperties = {
          ...inp,
          appearance: 'none' as const,
          backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%23888\' stroke-width=\'1.5\' fill=\'none\'/%3E%3C/svg%3E")',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 14px center',
          paddingRight: 36,
        };
        const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
        const MONTHS = [
          { value: 1, label: 'Janvier' }, { value: 2, label: 'Février' },
          { value: 3, label: 'Mars' }, { value: 4, label: 'Avril' },
          { value: 5, label: 'Mai' }, { value: 6, label: 'Juin' },
          { value: 7, label: 'Juillet' }, { value: 8, label: 'Août' },
          { value: 9, label: 'Septembre' }, { value: 10, label: 'Octobre' },
          { value: 11, label: 'Novembre' }, { value: 12, label: 'Décembre' },
        ];
        const curYear = new Date().getFullYear();
        const YEARS = Array.from({ length: curYear - 1924 }, (_, i) => curYear - 18 - i);

        return (
          <div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--text-3)', marginBottom: 8 }}>
                Date de naissance <span style={{ color: 'var(--accent)' }}>*</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1.5fr', gap: 8 }}>
                <select value={dobDay} onChange={(e) => setDobDay(e.target.value)} style={selectStyle}>
                  <option value="">Jour</option>
                  {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={dobMonth} onChange={(e) => setDobMonth(e.target.value)} style={selectStyle}>
                  <option value="">Mois</option>
                  {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select value={dobYear} onChange={(e) => setDobYear(e.target.value)} style={selectStyle}>
                  <option value="">Année</option>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--text-3)', marginBottom: 8 }}>
                Adresse personnelle <span style={{ color: 'var(--accent)' }}>*</span>
              </label>
              <AddressAutocomplete value={bankingAddress} onChange={setBankingAddress} style={inp} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--text-3)', marginBottom: 8 }}>
                IBAN <span style={{ color: 'var(--accent)' }}>*</span>
              </label>
              <input
                type="text"
                value={iban}
                onChange={(e) => setIban(e.target.value.toUpperCase())}
                onBlur={() => iban.trim() && setIban(formatIbanFriendly(iban))}
                placeholder="FR76 3000 4000 0312 3456 7890 143"
                style={{ ...inp, fontFamily: 'monospace', letterSpacing: '0.05em' }}
                autoComplete="off"
              />
              {iban.trim().length > 4 && !ibanValidation.ok && (
                <div style={{ fontSize: 11.5, color: 'var(--error)', marginTop: 5 }}>
                  {ibanValidation.error}
                </div>
              )}
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={tosAccepted}
                onChange={(e) => setTosAccepted(e.target.checked)}
                style={{ marginTop: 2, flexShrink: 0, accentColor: '#E57A97', width: 16, height: 16 }}
              />
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
                J&apos;accepte les{' '}
                <a href="https://stripe.com/fr/legal/connect-account" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                  Conditions d&apos;utilisation de Stripe
                </a>
                {' '}pour la réception de paiements.
              </span>
            </label>
          </div>
        );
      }

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
            onClick={() => handleSubmit()}
            disabled={submitting || !canAdvance()}
            style={{ ...btnPrimary, opacity: (submitting || !canAdvance()) ? 0.5 : 1 }}
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
            Passer cette étape
          </button>
        )}

        {/* "Configure later" for banking step (last step) */}
        {currentStep === 'banking' && isLastStep && (
          <button
            type="button"
            onClick={() => handleSubmit({ skipBankingSetup: true })}
            disabled={submitting}
            style={{
              background: 'none', border: 'none', color: 'var(--text-3)',
              fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
              textDecoration: 'underline', textUnderlineOffset: 3, textAlign: 'center',
            }}
          >
            Configurer plus tard
          </button>
        )}

        {/* "Skip" for banking step (not last — shouldn't normally happen) */}
        {currentStep === 'banking' && !isLastStep && (
          <button
            type="button"
            onClick={next}
            style={{
              background: 'none', border: 'none', color: 'var(--text-3)',
              fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
              textDecoration: 'underline', textUnderlineOffset: 3, textAlign: 'center',
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
