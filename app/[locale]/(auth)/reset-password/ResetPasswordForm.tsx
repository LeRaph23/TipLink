'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';

const inputStyle = (focused: boolean, error?: boolean): React.CSSProperties => ({
  width: '100%',
  background: 'var(--surface-2)',
  border: `1.5px solid ${error ? 'var(--error)' : focused ? 'var(--accent)' : 'var(--border)'}`,
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

export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const f = (k: string) => focus === k;

  const mismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError(t('passwordMismatch')); return; }
    setIsLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.push('/login?reset=true');
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>{t('newPassword')}</label>
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          required autoFocus minLength={8}
          placeholder={t('passwordMin')}
          style={inputStyle(f('pwd'))}
          onFocus={() => setFocus('pwd')} onBlur={() => setFocus(null)}
        />
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{t('passwordHint')}</p>
      </div>
      <div>
        <label style={labelStyle}>{t('confirmPassword')}</label>
        <input
          type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
          required minLength={8}
          placeholder={t('passwordMin')}
          style={inputStyle(f('confirm'), mismatch)}
          onFocus={() => setFocus('confirm')} onBlur={() => setFocus(null)}
        />
        {mismatch && <p style={{ fontSize: 11.5, color: 'var(--error)', marginTop: 4 }}>{t('passwordMismatch')}</p>}
      </div>

      {error && <p style={{ fontSize: 12, color: 'var(--error)' }}>{error}</p>}

      <button
        type="submit" disabled={isLoading || !password || !confirm || mismatch}
        style={{
          width: '100%', padding: '10px 16px', borderRadius: 'var(--radius)',
          background: 'var(--accent)', color: 'var(--accent-fg)',
          fontSize: 13.5, fontWeight: 600, border: 'none',
          cursor: (isLoading || !password || !confirm || mismatch) ? 'not-allowed' : 'pointer',
          opacity: (isLoading || !password || !confirm || mismatch) ? 0.6 : 1,
          transition: 'opacity 120ms', fontFamily: 'var(--font)', letterSpacing: '-0.01em',
        }}
      >
        {isLoading ? t('resetPasswordSubmitting') : `${t('resetPasswordSubmit')} ${tc('arrowRight')}`}
      </button>

      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
        <Link href="/login" style={{ color: 'var(--accent)' }}>← {t('backToLogin')}</Link>
      </p>
    </form>
  );
}
