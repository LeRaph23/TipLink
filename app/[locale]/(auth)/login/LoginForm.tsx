'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';

const inputStyle = (focused: boolean, error?: boolean): React.CSSProperties => ({
  width: '100%',
  background: 'var(--surface-2)',
  border: `1.5px solid ${error ? 'var(--error)' : focused ? 'var(--accent)' : 'var(--border)'}`,
  borderRadius: 'var(--radius-sm)',
  padding: '9px 12px',
  color: 'var(--text)',
  fontSize: 13.5,
  outline: 'none',
  boxShadow: focused ? '0 0 0 3px var(--accent-muted)' : 'none',
  transition: 'border-color 120ms, box-shadow 120ms',
  fontFamily: 'var(--font)',
});

const labelStyle: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 500, color: 'var(--text-2)', display: 'block', marginBottom: 5,
};

function mapAuthError(msg: string, t: (key: string) => string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('invalid login') || lower.includes('invalid credentials') || lower.includes('email not confirmed')) {
    return t('errorInvalidCredentials');
  }
  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return t('errorTooManyRequests');
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return t('errorNetwork');
  }
  return msg;
}

export function LoginForm({ verified, reset }: { verified?: boolean; reset?: boolean }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [pwdFocus, setPwdFocus] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(mapAuthError(error.message, t));
      setIsLoading(false);
      return;
    }
    // Keep loading state active until navigation completes
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {verified && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(22, 163, 74, 0.08)',
          border: '1px solid rgba(22, 163, 74, 0.35)',
          color: '#16a34a', fontSize: 13.5, fontWeight: 500,
        }}>
          ✓ {t('emailVerifiedBanner')}
        </div>
      )}
      {reset && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(22, 163, 74, 0.08)',
          border: '1px solid rgba(22, 163, 74, 0.35)',
          color: '#16a34a', fontSize: 13.5, fontWeight: 500,
        }}>
          ✓ {t('resetPasswordSuccess')}
        </div>
      )}
      <div>
        <label style={labelStyle}>{t('emailAddress')}</label>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com" required autoComplete="email"
          style={inputStyle(emailFocus)}
          onFocus={() => setEmailFocus(true)} onBlur={() => setEmailFocus(false)}
        />
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>{t('password')}</label>
          <Link
            href="/forgot-password"
            style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
          >
            {t('forgotPassword')}
          </Link>
        </div>
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          required autoComplete="current-password"
          style={inputStyle(pwdFocus)}
          onFocus={() => setPwdFocus(true)} onBlur={() => setPwdFocus(false)}
        />
      </div>

      {error && <p style={{ fontSize: 12, color: 'var(--error)' }}>{error}</p>}

      <button
        type="submit" disabled={isLoading}
        style={{
          width: '100%', padding: '10px 16px', borderRadius: 'var(--radius)',
          background: 'var(--accent)', color: 'var(--accent-fg)',
          fontSize: 13.5, fontWeight: 600, border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
          opacity: isLoading ? 0.6 : 1, transition: 'opacity 120ms',
          fontFamily: 'var(--font)', letterSpacing: '-0.01em',
        }}
      >
        {isLoading ? t('signingIn') : `${tc('signIn')} ${tc('arrowRight')}`}
      </button>
    </form>
  );
}
