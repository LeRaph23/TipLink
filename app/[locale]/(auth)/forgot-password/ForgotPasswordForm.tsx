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

export function ForgotPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${baseUrl}/auth/callback?next=/${locale}/reset-password`,
    });
    setIsLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          padding: '14px 18px', borderRadius: 'var(--radius)',
          background: 'var(--success-bg)',
          border: '1px solid color-mix(in oklch, var(--success) 30%, transparent)',
          color: 'var(--success)', fontSize: 13.5, lineHeight: 1.6,
        }}>
          ✓ {t('forgotPasswordSuccess')}
        </div>
        <Link href="/login" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', textAlign: 'center' }}>
          ← {t('backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>{t('emailAddress')}</label>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com" required autoFocus autoComplete="email"
          style={inputStyle(focused)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        />
      </div>

      {error && <p style={{ fontSize: 12, color: 'var(--error)' }}>{error}</p>}

      <button
        type="submit" disabled={isLoading || !email}
        style={{
          width: '100%', padding: '10px 16px', borderRadius: 'var(--radius)',
          background: 'var(--accent)', color: 'var(--accent-fg)',
          fontSize: 13.5, fontWeight: 600, border: 'none',
          cursor: (isLoading || !email) ? 'not-allowed' : 'pointer',
          opacity: (isLoading || !email) ? 0.6 : 1,
          transition: 'opacity 120ms', fontFamily: 'var(--font)', letterSpacing: '-0.01em',
        }}
      >
        {isLoading ? t('forgotPasswordSending') : `${t('forgotPasswordSubmit')} ${tc('arrowRight')}`}
      </button>

      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
        <Link href="/login" style={{ color: 'var(--accent)' }}>← {t('backToLogin')}</Link>
      </p>
    </form>
  );
}
