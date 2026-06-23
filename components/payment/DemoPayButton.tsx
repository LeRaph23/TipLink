'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

interface Props {
  // Single-staff tip vs. whole-team (group) tip.
  kind: 'staff' | 'group';
  targetId: string; // staffId or establishmentId
  amount: number;   // total charge in cents (tip + service fee), shown on success
  currency: string;
}

// Replaces the Stripe checkout when an establishment is in demo mode: no charge,
// no PaymentIntent, no DB write — just routes to the success screen so the full
// experience (incl. the Google review prompt) can be shown in a sales demo.
export function DemoPayButton({ kind, targetId, amount, currency }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('pay');
  const [going, setGoing] = useState(false);

  const fmt = new Intl.NumberFormat(undefined, {
    style: 'currency', currency, minimumFractionDigits: 2,
  });

  function pay() {
    setGoing(true);
    const params = new URLSearchParams({
      demo: '1',
      amt: String(amount),
      cur: currency,
    });
    if (kind === 'staff') params.set('staff', targetId);
    else params.set('establishment', targetId);
    router.push(`/${locale}/pay/success?${params.toString()}`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 10,
        background: 'var(--surface-2)', border: '1px dashed var(--border)',
        color: 'var(--text-3)', fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
      }}>
        🧪 {t('demo.banner')}
      </div>
      <button
        type="button"
        onClick={pay}
        disabled={going}
        style={{
          width: '100%', height: 58, borderRadius: 14, border: 'none',
          background: going ? 'var(--accent-muted)' : 'var(--accent)',
          color: going ? 'var(--accent)' : '#fff',
          cursor: going ? 'not-allowed' : 'pointer',
          fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', transition: 'all 130ms',
        }}
      >
        {going ? t('processingButton') : t('demo.payButton', { amount: fmt.format(amount / 100) })}
      </button>
    </div>
  );
}
