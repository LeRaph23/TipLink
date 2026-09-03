'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RESEND_COOLDOWN_MS, requestEmailCode, verifyEmailCode } from '@/lib/auth/otp';
import { mapAuthError } from '@/lib/auth/map-auth-error';

type Phase = 'email' | 'code';

const CODE_LENGTH = 6;

/**
 * Email address, then the six-digit code that arrives at it.
 *
 * One widget for all four entry points (login, onboarding, join, order) so the
 * sign-in gesture is identical wherever it happens: four near-identical
 * implementations would have drifted into four different ideas of what a wrong
 * code looks like.
 *
 * The two phases live in component state rather than separate routes. A route
 * would have to carry the address in its URL, would need adding to the proxy's
 * auth list and to the SEO route registry, and would put a page nobody can
 * usefully bookmark into browser history.
 */
export function EmailOtpForm({
  initialEmail = '',
  shouldCreateUser,
  fullName,
  lockEmail = false,
  submitLabel,
  onVerified,
  onEmailChange,
  autoFocus = true,
}: {
  initialEmail?: string;
  /** False wherever an unknown address must not silently become an account. */
  shouldCreateUser: boolean;
  /** Stored as user metadata when the code creates the account. */
  fullName?: string;
  /** The address is settled by the caller and must not be edited here. */
  lockEmail?: boolean;
  submitLabel?: string;
  onVerified: () => void | Promise<void>;
  /** Fired when a code is requested, so the caller can remember the address. */
  onEmailChange?: (email: string) => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations('auth');
  const [phase, setPhase] = useState<Phase>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Seconds left before the resend link is offered again. Supabase refuses a
  // second send inside its own window anyway, so this is the honest wait
  // rather than a button that fails when pressed.
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const send = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await requestEmailCode(email, { shouldCreateUser, fullName });
    setBusy(false);
    if (!res.ok) {
      setError(mapAuthError(res.message, t));
      return;
    }
    onEmailChange?.(email.trim());
    setPhase('code');
    setCode('');
    setCooldown(Math.round(RESEND_COOLDOWN_MS / 1000));
    // The field only exists once the phase flips, so focus waits a tick.
    setTimeout(() => codeRef.current?.focus(), 0);
  }, [email, shouldCreateUser, fullName, onEmailChange, t]);

  const verify = useCallback(
    async (value: string) => {
      setBusy(true);
      setError(null);
      const res = await verifyEmailCode(email, value);
      if (!res.ok) {
        setError(mapAuthError(res.message, t));
        setCode('');
        setBusy(false);
        codeRef.current?.focus();
        return;
      }
      // The caller usually navigates or unmounts from here, which makes this
      // reset a no-op. It matters in the case where it does not: a caller whose
      // own follow-up fails leaves the widget mounted, and a permanently
      // disabled button would be a dead end on a screen that just succeeded.
      await onVerified();
      setBusy(false);
    },
    [email, onVerified, t],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {phase === 'email' ? (
        <>
          <div>
            <label style={labelStyle} htmlFor="otp-email">{t('emailAddress')}</label>
            <input
              id="otp-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus={autoFocus}
              value={email}
              readOnly={lockEmail}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && emailValid && !busy) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="vous@exemple.com"
              style={{ ...inputStyle, opacity: lockEmail ? 0.7 : 1 }}
            />
          </div>

          {error && <p style={errorStyle}>{error}</p>}

          <button
            type="button"
            onClick={() => void send()}
            disabled={!emailValid || busy}
            style={{ ...buttonStyle, opacity: !emailValid || busy ? 0.5 : 1 }}
          >
            {busy ? t('sendingCode') : (submitLabel ?? t('sendCode'))}
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
            {t.rich('codeSentTo', {
              email,
              strong: (c) => <strong style={{ color: 'var(--text)' }}>{c}</strong>,
            })}
          </p>

          <div>
            <label style={labelStyle} htmlFor="otp-code">{t('codeLabel')}</label>
            <input
              id="otp-code"
              ref={codeRef}
              type="text"
              inputMode="numeric"
              // The one autocomplete token browsers and iOS use to offer the
              // code straight from the notification, without opening the inbox.
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              value={code}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
                setCode(next);
                // Submit as soon as the last digit lands: asking someone to
                // press a button after typing exactly six digits is a step that
                // carries no decision.
                if (next.length === CODE_LENGTH && !busy) void verify(next);
              }}
              placeholder="123456"
              style={{
                ...inputStyle,
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: '0.34em',
                textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
          </div>

          {error && <p style={errorStyle}>{error}</p>}

          <button
            type="button"
            onClick={() => void verify(code)}
            disabled={code.length !== CODE_LENGTH || busy}
            style={{ ...buttonStyle, opacity: code.length !== CODE_LENGTH || busy ? 0.5 : 1 }}
          >
            {busy ? t('verifyingCode') : t('verifyCode')}
          </button>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={cooldown > 0 || busy}
              onClick={() => void send()}
              style={{ ...linkStyle, opacity: cooldown > 0 || busy ? 0.5 : 1 }}
            >
              {cooldown > 0 ? t('resendCodeIn', { seconds: cooldown }) : t('resendCode')}
            </button>

            {!lockEmail && (
              <button
                type="button"
                onClick={() => { setPhase('email'); setError(null); setCode(''); }}
                style={linkStyle}
              >
                {t('changeEmail')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 500,
  color: 'var(--text-2)',
  display: 'block',
  marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1.5px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '11px 13px',
  color: 'var(--text)',
  fontSize: 15,
  outline: 'none',
  fontFamily: 'var(--font)',
  boxSizing: 'border-box',
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 'var(--radius)',
  background: 'var(--accent)',
  color: 'var(--accent-fg)',
  fontSize: 14,
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--font)',
  letterSpacing: '-0.01em',
  transition: 'opacity 120ms',
};

const linkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-3)',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'var(--font)',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
  padding: 0,
};

const errorStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: 'var(--error)',
  margin: 0,
  lineHeight: 1.5,
};
