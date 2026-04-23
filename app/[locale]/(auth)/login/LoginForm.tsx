'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
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

export function LoginForm() {
  const router = useRouter();
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
    if (error) { setError(error.message); setIsLoading(false); return; }
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        <label style={labelStyle}>{t('password')}</label>
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
