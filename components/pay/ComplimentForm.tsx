'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { trackEvent } from '@/lib/analytics';
import { COMPLIMENT_MESSAGE_MAX, COMPLIMENT_TAGS, type ComplimentTag } from '@/lib/compliments';
import { PayIcon, Spinner, btnProps } from './ui';

/**
 * "A word for Julie?" on the tip success page (Digitip Pro).
 *
 * Optional in every sense: nothing on the page waits for it, the review
 * invitation above it is shown whether or not it is used, and one chip is a
 * complete answer. The customer has already been generous once; this asks for
 * one more tap, not a form.
 *
 * In demo mode it behaves the same and stores nothing, so a manager trying
 * the flow on a demo establishment sees exactly what a customer will.
 */
/** "Un petit mot pour Clara ?", not "pour Clara Dubois ?": nobody talks like that. */
function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}

export function ComplimentForm({
  transactionId,
  staffName,
  demo = false,
}: {
  /** Null in demo mode, where no tip exists to attach the compliment to. */
  transactionId: string | null;
  staffName: string | null;
  demo?: boolean;
}) {
  const t = useTranslations('pay.compliment');
  const [tags, setTags] = useState<ComplimentTag[]>([]);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const canSend = (tags.length > 0 || message.trim().length > 0) && state !== 'sending';

  function toggle(tag: ComplimentTag) {
    setTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));
  }

  async function send() {
    if (!canSend) return;
    setState('sending');
    trackEvent('compliment_sent', { tags: tags.length, message: message.trim().length > 0 });
    if (demo || !transactionId) {
      setState('sent');
      return;
    }
    try {
      const res = await fetch('/api/compliments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, tags, message: message.trim() || undefined }),
      });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  }

  const card: React.CSSProperties = {
    marginTop: 12, padding: 20, borderRadius: 'var(--radius-lg)',
    background: 'var(--surface)', border: '1px solid var(--border-subtle)',
  };

  if (state === 'sent') {
    return (
      <div className="dg-reveal" style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }} role="status">
        <span style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--accent-muted, rgba(229,122,151,0.12))', color: 'var(--accent)',
        }}>
          <PayIcon name="heart" size={18} color="var(--accent)" />
        </span>
        <p style={{ font: '500 15px/22px var(--font)', color: 'var(--text)', margin: 0 }}>
          {staffName ? t('sentNamed', { name: firstName(staffName) }) : t('sent')}
        </p>
      </div>
    );
  }

  const send_ = btnProps('secondary', 'M', { full: true, disabled: !canSend, loading: state === 'sending' });

  return (
    <div style={card}>
      <h2 style={{ font: '600 18px/26px var(--font-display)', color: 'var(--text)', margin: '0 0 12px' }}>
        {staffName ? t('titleNamed', { name: firstName(staffName) }) : t('title')}
      </h2>

      <div role="group" aria-label={t('chipsLabel')} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {COMPLIMENT_TAGS.map((tag) => {
          const on = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(tag)}
              className="dg-press dg-tile"
              style={{
                minHeight: 40, padding: '0 14px', borderRadius: 999,
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                background: on ? 'var(--accent-muted, rgba(229,122,151,0.12))' : 'var(--surface)',
                color: on ? 'var(--accent)' : 'var(--text)',
                font: '500 14px/20px var(--font)', cursor: 'pointer',
              }}
            >
              {t(`tags.${tag}`)}
            </button>
          );
        })}
      </div>

      <label style={{ display: 'block', marginTop: 14 }}>
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {t('messageLabel')}
        </span>
        <textarea
          className="dg-field"
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, COMPLIMENT_MESSAGE_MAX))}
          placeholder={t('placeholder')}
          rows={2}
          maxLength={COMPLIMENT_MESSAGE_MAX}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            padding: '12px 14px', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', font: '400 15px/22px var(--font)',
          }}
        />
      </label>

      <button
        type="button"
        onClick={send}
        disabled={!canSend}
        className={send_.className}
        style={{ ...send_.style, marginTop: 12 }}
      >
        {state === 'sending' ? <Spinner /> : null}
        {t('send')}
      </button>
      {state === 'error' && (
        <p role="alert" style={{ font: '400 13px/18px var(--font)', color: 'var(--error)', margin: '8px 0 0' }}>
          {t('error')}
        </p>
      )}
      <p style={{ font: '400 12px/16px var(--font)', color: 'var(--text-3)', margin: '10px 0 0' }}>
        {staffName ? t('privacyNamed', { name: firstName(staffName) }) : t('privacy')}
      </p>
    </div>
  );
}
