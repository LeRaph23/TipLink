'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const t = useTranslations('error');

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px', textAlign: 'center',
    }}>
      <div className="fade-up">
        <div style={{
          width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px',
          background: 'var(--error-bg)',
          border: '1.5px solid color-mix(in oklch, var(--error) 30%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="var(--error)" strokeWidth="2.5" strokeLinecap="round">
            <path d="M16 10v7M16 21v1" />
            <path d="M4 26h24L16 6 4 26z" />
          </svg>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 8 }}>
          {t('title')}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-3)', maxWidth: 320, lineHeight: 1.7, marginBottom: 28 }}>
          {t('description')}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            onClick={reset}
            style={{
              padding: '9px 18px', borderRadius: 'var(--radius)',
              background: 'var(--accent)', color: 'var(--accent-fg)',
              fontSize: 13.5, fontWeight: 600, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            {t('retry')}
          </button>
          <Link href="/" style={{
            padding: '9px 18px', borderRadius: 'var(--radius)',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 13.5, fontWeight: 500, textDecoration: 'none',
          }}>
            ← {t('home')}
          </Link>
        </div>
        {error.digest && (
          <p style={{ marginTop: 24, fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>
            {t('ref')} {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
