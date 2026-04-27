'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  staffId: string;
  locale: string;
}

export function TipLinkCard({ staffId, locale }: Props) {
  const t = useTranslations('dashboard.staff');
  const [copied, setCopied] = useState(false);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';
  const url = `${baseUrl}/${locale}/pay/${staffId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* noop */ }
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'My tip link', url }).catch(() => {});
    } else {
      handleCopy();
    }
  };

  return (
    <div style={{
      padding: 18, background: 'var(--surface)',
      border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)',
      marginBottom: 24,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
      }}>
        {t('tipLink')}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <code style={{
          flex: 1, fontSize: 11.5, fontFamily: 'ui-monospace, monospace',
          color: 'var(--text-2)', background: 'var(--surface-2)',
          padding: '7px 10px', borderRadius: 6, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {url}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            padding: '6px 12px', borderRadius: 7,
            border: '1px solid var(--border)', background: 'none',
            color: copied ? 'var(--success)' : 'var(--text-2)',
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
            fontFamily: 'var(--font)', transition: 'color 150ms', flexShrink: 0,
          }}
        >
          {copied ? t('tipLinkCopied') : t('tipLinkCopy')}
        </button>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button
            type="button"
            onClick={handleShare}
            title="Share"
            style={{
              padding: '6px 10px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'none',
              color: 'var(--text-2)', fontSize: 14, cursor: 'pointer',
              fontFamily: 'var(--font)', flexShrink: 0,
            }}
          >
            ↗
          </button>
        )}
      </div>
    </div>
  );
}
