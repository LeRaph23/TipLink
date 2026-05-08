'use client';

import { useTranslations } from 'next-intl';
import { STEPS, type Step } from '@/lib/order-validation';

export function ProgressBar({
  current,
  onStepClick,
  reachable,
  steps = STEPS,
}: {
  current: Step;
  onStepClick: (s: Step) => void;
  reachable: Step;
  steps?: readonly Step[];
}) {
  const t = useTranslations('order.steps');
  const currentIdx = steps.indexOf(current);
  const reachableIdx = steps.indexOf(reachable);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, width: '100%',
      maxWidth: 620, margin: '0 auto',
    }}>
      {steps.map((s, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        const canClick = i <= reachableIdx;

        return (
          <div key={s} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              disabled={!canClick}
              onClick={() => canClick && onStepClick(s)}
              title={t(s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 999,
                background: isActive
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.2))'
                  : 'transparent',
                border: 'none',
                cursor: canClick ? 'pointer' : 'default',
                fontFamily: 'var(--font)',
                transition: 'background 160ms',
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: '50%',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: isDone || isActive ? 'var(--accent)' : 'var(--surface-2)',
                color: isDone || isActive ? '#fff' : 'var(--text-3)',
                border: isDone || isActive ? 'none' : '1px solid var(--border)',
                transition: 'all 200ms',
              }}>
                {isDone ? (
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M4 8.5l2.5 2.5L12 5.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : i + 1}
              </span>
              <span style={{
                fontSize: 12.5, fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--text)' : isDone ? 'var(--text-2)' : 'var(--text-3)',
                whiteSpace: 'nowrap',
              }}>
                {t(s)}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: 2, borderRadius: 1,
                background: i < currentIdx ? 'var(--accent)' : 'var(--border-subtle)',
                transition: 'background 240ms',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
