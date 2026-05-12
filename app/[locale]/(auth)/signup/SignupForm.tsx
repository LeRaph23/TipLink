'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';

const inputStyle = (focused: boolean): React.CSSProperties => ({
  width: '100%',
  background: 'var(--surface-2)',
  border: `1.5px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
  borderRadius: 'var(--radius-sm)',
  padding: '9px 12px',
  color: 'var(--text)', fontSize: 13.5, outline: 'none',
  boxShadow: focused ? '0 0 0 3px var(--accent-muted)' : 'none',
  transition: 'border-color 120ms, box-shadow 120ms',
  fontFamily: 'var(--font)',
});

const labelStyle: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 500, color: 'var(--text-2)', display: 'block', marginBottom: 5,
};

function mapSignupError(msg: string, t: (key: string) => string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('already registered') || lower.includes('already in use') || lower.includes('email_address_invalid')) {
    return t('errorEmailInUse');
  }
  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return t('errorTooManyRequests');
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return t('errorNetwork');
  }
  return msg;
}

export function SignupForm() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [emailConfirm, setEmailConfirm] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const f = (k: string) => focus === k;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setIsLoading(false);
    if (signUpError) {
      setError(mapSignupError(signUpError.message, t));
      return;
    }
    setEmailConfirm(true);
  };

  const handleResend = async () => {
    setIsResending(true);
    const supabase = createClient();
    await supabase.auth.resend({ type: 'signup', email });
    setIsResending(false);
    setResent(true);
    setTimeout(() => setResent(false), 4000);
  };

  if (emailConfirm) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          padding: '16px 20px', borderRadius: 'var(--radius)',
          background: 'var(--success-bg)',
          border: '1px solid color-mix(in oklch, var(--success) 30%, transparent)',
          color: 'var(--success)', fontSize: 13.5, textAlign: 'center', lineHeight: 1.6,
        }}>
          ✓ {t('checkEmail')}
        </div>

        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
          {t('checkEmailResend')}{' '}
          <button
            onClick={handleResend}
            disabled={isResending || resent}
            style={{
              background: 'none', border: 'none', cursor: (isResending || resent) ? 'default' : 'pointer',
              color: resent ? 'var(--success)' : 'var(--accent)', fontSize: 13,
              fontFamily: 'var(--font)', padding: 0, textDecoration: 'underline',
              opacity: isResending ? 0.6 : 1,
            }}
          >
            {resent ? `✓ ${t('resendEmailSent')}` : isResending ? t('resendEmailSending') : t('resendEmail')}
          </button>
        </div>

        <button
          onClick={() => setEmailConfirm(false)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', fontSize: 13, fontFamily: 'var(--font)',
            textDecoration: 'underline',
          }}
        >
          ← {t('correctEmail')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>{t('fullName')}</label>
        <input
          type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
          placeholder="Marco Rossi" required autoFocus
          style={inputStyle(f('name'))}
          onFocus={() => setFocus('name')} onBlur={() => setFocus(null)}
        />
      </div>
      <div>
        <label style={labelStyle}>{t('emailAddress')}</label>
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" required autoComplete="email"
          style={inputStyle(f('email'))}
          onFocus={() => setFocus('email')} onBlur={() => setFocus(null)}
        />
      </div>
      <div>
        <label style={labelStyle}>{t('password')}</label>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder={t('passwordMin')} required minLength={8}
          style={inputStyle(f('pwd'))}
          onFocus={() => setFocus('pwd')} onBlur={() => setFocus(null)}
        />
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{t('passwordHint')}</p>
      </div>

      {error && <p style={{ fontSize: 12, color: 'var(--error)' }}>{error}</p>}

      <button
        type="submit" disabled={isLoading || !fullName || !email || !password}
        style={{
          width: '100%', padding: '10px 16px', borderRadius: 'var(--radius)',
          background: 'var(--accent)', color: 'var(--accent-fg)',
          fontSize: 13.5, fontWeight: 600, border: 'none',
          cursor: (isLoading || !fullName || !email || !password) ? 'not-allowed' : 'pointer',
          opacity: (isLoading || !fullName || !email || !password) ? 0.5 : 1,
          transition: 'opacity 120ms', fontFamily: 'var(--font)', letterSpacing: '-0.01em',
        }}
      >
        {isLoading ? t('creatingAccount') : `${t('createAccount')} ${tc('arrowRight')}`}
      </button>

      <p style={{ fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6 }}>
        {t('termsPrefix')}{' '}
        <Link href="/terms" style={{ color: 'var(--text-2)' }}>{tc('terms')}</Link> {t('and')}{' '}
        <Link href="/privacy" style={{ color: 'var(--text-2)' }}>{tc('privacy')}</Link>.
      </p>
    </form>
  );
}
