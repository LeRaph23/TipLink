'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Shown when a manager scans a plaque bought online that is not activated yet.
 * The activation link is emailed to the buyer rather than opened here: anyone
 * who scans the plaque reaches this screen, and letting them set it up would
 * let them have its tips paid to themselves.
 */
export function ActivatePlaque({ tag, maskedEmail }: { tag: string; maskedEmail: string | null }) {
  const t = useTranslations('onboarding.activate');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error' | 'limited'>('idle');
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function send() {
    setState('sending');
    try {
      const res = await fetch('/api/onboarding/activation-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 429) { setState('limited'); return; }
      if (!res.ok) { setState('error'); return; }
      setSentTo(d.sentTo ?? maskedEmail);
      setState('sent');
    } catch {
      setState('error');
    }
  }

  return (
    <div style={{
      maxWidth: 440, margin: '0 auto', padding: '32px 24px', borderRadius: 20,
      background: 'var(--surface)', border: '1px solid var(--border-subtle)', textAlign: 'center',
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{state === 'sent' ? '📬' : '✨'}</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px', color: 'var(--text)' }}>
        {state === 'sent' ? t('sentTitle') : t('title')}
      </h1>

      {state === 'sent' ? (
        <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-2)', margin: 0 }}>
          {t('sentBody', { email: sentTo ?? '' })}
        </p>
      ) : maskedEmail ? (
        <>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-2)', margin: '0 0 22px' }}>
            {t('body', { email: maskedEmail })}
          </p>
          <button
            type="button"
            onClick={() => { void send(); }}
            disabled={state === 'sending'}
            style={{
              width: '100%', padding: '15px 20px', borderRadius: 14, border: 'none',
              background: 'linear-gradient(135deg, #E57A97, #EC97B0)', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: state === 'sending' ? 'wait' : 'pointer',
              boxShadow: '0 6px 24px rgba(229,122,151,0.35)', opacity: state === 'sending' ? 0.7 : 1,
              fontFamily: 'var(--font)',
            }}
          >
            {state === 'sending' ? t('sending') : t('cta')}
          </button>
          {(state === 'error' || state === 'limited') && (
            <p role="alert" style={{ fontSize: 13, color: 'var(--error)', margin: '14px 0 0' }}>
              {state === 'limited' ? t('limited') : t('error')}
            </p>
          )}
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '18px 0 0', lineHeight: 1.5 }}>
            {t('why')}
          </p>
        </>
      ) : (
        <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-2)', margin: 0 }}>
          {t('noEmail')}
        </p>
      )}
    </div>
  );
}
