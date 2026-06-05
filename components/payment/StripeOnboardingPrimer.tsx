'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

const primaryBtn: React.CSSProperties = {
  padding: '13px 20px', borderRadius: 12, border: 'none',
  background: 'var(--accent)', color: '#fff',
  fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'var(--font)', width: '100%',
};

const ghostBtn: React.CSSProperties = {
  padding: '13px 20px', borderRadius: 12,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-2)', fontSize: 14, fontWeight: 500,
  cursor: 'pointer', fontFamily: 'var(--font)',
};

// Line-style icons (16×16, currentColor stroke).
const svgBase = {
  width: 28, height: 28, viewBox: '0 0 16 16', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.4,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};
function ShieldIcon() {
  return <svg {...svgBase}><path d="M8 1.5l5 2v3.5c0 3-2 5.2-5 6.5-3-1.3-5-3.5-5-6.5V3.5l5-2z" /><path d="M6 8l1.5 1.5 2.7-3" /></svg>;
}
function CheckIcon() {
  return <svg {...svgBase}><circle cx="8" cy="8" r="6.5" /><path d="M5.3 8.2l1.8 1.8 3.6-3.8" /></svg>;
}
function UserIcon() {
  return <svg {...svgBase}><circle cx="8" cy="5.5" r="2.6" /><path d="M3 13.5c0-2.8 2.2-4.3 5-4.3s5 1.5 5 4.3" /></svg>;
}
function IdIcon() {
  return <svg {...svgBase}><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" /><circle cx="5" cy="7.3" r="1.4" /><path d="M3.3 11c0-1.1 .8-1.8 1.7-1.8s1.7 .7 1.7 1.8" /><path d="M9 6.6h3.4M9 9h2.8" /></svg>;
}
function SkipIcon() {
  return <svg {...svgBase}><circle cx="8" cy="8" r="6.3" /><path d="M4 4l8 8" /></svg>;
}

// One idea per screen: light cards that prepare the recipient for exactly what
// Stripe's hosted onboarding will show (keep "Individual", have ID + IBAN ready,
// skip the Tax/Climate upsells) before handing off. Shared by the dashboard
// banking setup and the staff invite flow so the guidance is identical.
const STEPS = [
  { Icon: ShieldIcon, key: 'step1' }, // why Stripe / your money is safe
  { Icon: CheckIcon, key: 'step2' },  // quick, one-time, then automatic
  { Icon: UserIcon, key: 'step3' },   // keep "auto-entrepreneur"
  { Icon: IdIcon, key: 'step4' },     // what to have ready
  { Icon: SkipIcon, key: 'step5' },   // skip the Tax / Climate upsells
] as const;

export function StripeOnboardingPrimer({
  onContinue,
  pending = false,
  error = null,
}: {
  onContinue: () => void;
  pending?: boolean;
  error?: string | null;
}) {
  const t = useTranslations('dashboard.banking');
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{`@keyframes onbSlideIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}@media(prefers-reduced-motion:reduce){.onb-card{animation:none!important}}`}</style>
      {error && (
        <div style={{ fontSize: 12.5, color: 'var(--error)', padding: '10px 14px', background: 'var(--error-bg)', borderRadius: 8 }}>
          {error}
        </div>
      )}

      {/* Single-idea card, re-animated on each step change. */}
      <div
        key={stepIdx}
        className="onb-card"
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
          gap: 12, padding: '32px 24px', borderRadius: 16,
          background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
          animation: 'onbSlideIn 220ms ease-out',
        }}
      >
        <span aria-hidden style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 58, height: 58, borderRadius: 16, marginBottom: 2,
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          color: 'var(--accent)',
        }}>
          <step.Icon />
        </span>
        <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.25 }}>
          {t(`${step.key}Title`)}
        </div>
        <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.65, margin: 0, maxWidth: 340 }}>
          {t(`${step.key}Body`)}
        </p>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
        {STEPS.map((_, i) => (
          <span
            key={i}
            style={{
              width: i === stepIdx ? 18 : 6, height: 6, borderRadius: 999,
              background: i === stepIdx ? 'var(--accent)' : 'var(--border)',
              transition: 'all 200ms',
            }}
          />
        ))}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 10 }}>
        {stepIdx > 0 && (
          <button type="button" style={ghostBtn} onClick={() => setStepIdx((i) => i - 1)} disabled={pending}>
            {t('back')}
          </button>
        )}
        {isLast ? (
          <button type="button" style={{ ...primaryBtn, flex: 1, opacity: pending ? 0.6 : 1 }} disabled={pending} onClick={onContinue}>
            {pending ? t('openingStripe') : t('setupCta')}
          </button>
        ) : (
          <button type="button" style={{ ...primaryBtn, flex: 1 }} onClick={() => setStepIdx((i) => i + 1)}>
            {t('continue')}
          </button>
        )}
      </div>
    </div>
  );
}
