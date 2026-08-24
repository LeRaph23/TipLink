'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius)',
  padding: 20,
  marginBottom: 20,
};

type Props = {
  groupId: string;
  isPro: boolean;
  locale: 'fr' | 'en';
};

export function ProCard({ groupId, isPro, locale }: Props) {
  const t = useTranslations('dashboard.pro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(interval: 'monthly' | 'yearly') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, interval, locale }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error === 'pro_unavailable' ? t('unavailable') : t('failed'));
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(t('failed'));
      setBusy(false);
    }
  }

  if (isPro) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{
            padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700,
            background: 'var(--success-bg)', color: 'var(--success)',
          }}>
            Pro
          </span>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{t('activeTitle')}</div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 14 }}>
          {t('activeBody')}
        </p>
        <button
          type="button"
          onClick={() => go('monthly')}
          disabled={busy}
          style={{
            padding: '9px 16px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--text-2)', fontSize: 13, fontWeight: 600,
            cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--font)',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? t('opening') : t('manage')}
        </button>
        {error && (
          <p style={{ fontSize: 12.5, color: 'var(--error)', marginTop: 10 }}>{error}</p>
        )}
      </div>
    );
  }

  return (
    <div style={{ ...card, border: '1px solid var(--accent-border, rgba(229,122,151,0.3))' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
        {t('upsellTitle')}
      </div>

      <ul style={{
        listStyle: 'none', padding: 0, margin: '0 0 16px',
        display: 'flex', flexDirection: 'column', gap: 7,
      }}>
        {[t('feature1'), t('feature2'), t('feature3')].map((f) => (
          <li key={f} style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            <span style={{ color: 'var(--accent)', marginRight: 7 }}>✓</span>
            {f}
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => go('monthly')}
          disabled={busy}
          style={{
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #E57A97, #EC97B0)',
            color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--font)',
            boxShadow: '0 4px 14px rgba(229,122,151,0.3)',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? t('opening') : t('ctaMonthly')}
        </button>
        <button
          type="button"
          onClick={() => go('yearly')}
          disabled={busy}
          style={{
            padding: '10px 18px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--text-2)', fontSize: 13, fontWeight: 600,
            cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--font)',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {t('ctaYearly')}
        </button>
      </div>

      {error && <p style={{ fontSize: 12.5, color: 'var(--error)', marginTop: 10 }}>{error}</p>}
    </div>
  );
}
