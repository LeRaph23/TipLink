'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { moneyFormatter } from '@/lib/money';
import { PayButton } from './tip-ui';

interface Props {
  // Single-staff tip vs. whole-team (group) tip.
  kind: 'staff' | 'group';
  targetId: string; // staffId or establishmentId
  amount: number;   // total charge in cents (tip + service fee), shown on success
  tip: number;      // the tip alone, so the success screen can show what the total is made of
  currency: string;
}

// Replaces the Stripe checkout when an establishment is in demo mode: no charge,
// no PaymentIntent, no DB write — just routes to the success screen so the full
// experience (incl. the Google review prompt) can be shown in a sales demo.
// Nothing on screen says "demo": prospects should see exactly what a customer
// sees. The establishment's is_demo flag is what keeps it from charging.
export function DemoPayButton({ kind, targetId, amount, tip, currency }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('pay');
  const [going, setGoing] = useState(false);

  // The page locale, not the device's: the server rendered "€2" and the
  // browser "2 €", a hydration mismatch on every tip page (sixth QA run).
  const pageLocale = locale;
  const fmt = moneyFormatter(pageLocale, currency, 2);

  function pay() {
    setGoing(true);
    const params = new URLSearchParams({
      demo: '1',
      amt: String(amount),
      tip: String(tip),
      cur: currency,
    });
    if (kind === 'staff') params.set('staff', targetId);
    else params.set('establishment', targetId);
    router.push(`/${locale}/pay/success?${params.toString()}`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
      <PayButton onClick={pay} loading={going}>
        {going ? t('processingButton') : t('demo.payButton', { amount: fmt.format(amount / 100) })}
      </PayButton>
    </div>
  );
}
