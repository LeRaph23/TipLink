'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  /** Already formatted amounts. */
  tip: string;
  fee: string;
  total: string;
  /** Team tip shared between several people: "≈ 2,50 € / pers". */
  perPerson?: string | null;
}

// What the customer is about to be charged, as a two-line receipt. It used to
// be one 12 px grey sentence, the smallest text on the screen for the one
// figure that reassures (UI/UX audit, UX-04).
export function TipSummary({ tip, fee, total, perPerson }: Props) {
  const t = useTranslations('pay');
  const [showFeeInfo, setShowFeeInfo] = useState(false);

  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    fontSize: 14, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums',
  };

  return (
    <div style={{ padding: '2px 6px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={row}>
        <span>
          {t('summaryTip')}
          {perPerson && <span style={{ color: 'var(--text-2)' }}> · {t('group.perPerson', { amount: perPerson })}</span>}
        </span>
        <span>{tip}</span>
      </div>
      <div style={row}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {t('summaryFee')}
          <button
            type="button"
            onClick={() => setShowFeeInfo((v) => !v)}
            aria-expanded={showFeeInfo}
            aria-label={t('feeInfoLabel')}
            // 44 × 44 touch target around an 18 px glyph.
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 44, height: 44, margin: '-13px -10px', padding: 0,
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: '50%',
                border: '1px solid var(--border)',
                background: showFeeInfo ? 'var(--accent-muted)' : 'var(--surface-2)',
                color: 'var(--text-2)', fontSize: 11, fontWeight: 700,
                fontStyle: 'italic', fontFamily: 'Georgia, serif', lineHeight: 1,
              }}
            >
              i
            </span>
          </button>
        </span>
        <span>{fee}</span>
      </div>
      {showFeeInfo && (
        <p
          className="fade-up"
          style={{
            fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55,
            margin: '4px 0', background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
            padding: '9px 12px', borderRadius: 10,
          }}
        >
          {t('feeInfo')}
        </p>
      )}
      <div
        style={{
          ...row, marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--border-subtle)',
          fontSize: 16, fontWeight: 800, color: 'var(--text)',
        }}
      >
        <span>{t('summaryTotal')}</span>
        <span key={total} className="amount-tick">{total}</span>
      </div>
    </div>
  );
}
