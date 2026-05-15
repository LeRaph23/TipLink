'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function StripeDashboardButton() {
  const t = useTranslations('dashboard.staff');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const handleClick = async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/stripe/login-link');
      const data = await res.json();
      if (!res.ok || !data.url) {
        setStatus('error');
        return;
      }
      window.open(data.url, '_blank', 'noopener,noreferrer');
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === 'loading'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 8,
        border: '1px solid var(--border)', background: 'transparent',
        color: status === 'error' ? 'var(--error)' : 'var(--text-2)',
        fontSize: 12.5, fontWeight: 500, cursor: status === 'loading' ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font)', opacity: status === 'loading' ? 0.6 : 1,
        transition: 'color 150ms',
      }}
    >
      {status === 'loading' ? (
        <svg width="13" height="13" viewBox="0 0 16 16" style={{ animation: 'spin .7s linear infinite' }}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="28" strokeDashoffset="10" opacity="0.85" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="14" height="9" rx="1.5" /><path d="M1 7h14" /><circle cx="5" cy="11" r="1" fill="currentColor" stroke="none" />
        </svg>
      )}
      {status === 'loading' ? t('stripeLoading') : t('stripeDashboard')}
    </button>
  );
}
