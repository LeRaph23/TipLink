'use client';

import { useState } from 'react';
import { CheckoutForm } from './CheckoutForm';

interface Props {
  staffId: string;
  currency: string;
  thresholds: number[];
}

export function AmountSelector({ staffId, currency, thresholds }: Props) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  // One nonce per page load — used as part of idempotency key
  const [nonce] = useState(() => crypto.randomUUID());

  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  });

  return (
    <div className="space-y-6">
      <p className="text-center text-sm text-muted-foreground font-medium uppercase tracking-wide">
        Select a tip amount
      </p>

      <div className="grid grid-cols-4 gap-2">
        {thresholds.map((amount) => {
          const amountInCents = amount * 100;
          const isSelected = selectedAmount === amountInCents;
          return (
            <button
              key={amount}
              onClick={() => setSelectedAmount(amountInCents)}
              className={[
                'p-4 rounded-xl border-2 font-semibold text-sm transition-all',
                isSelected
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border hover:border-foreground/50',
              ].join(' ')}
            >
              {formatter.format(amount)}
            </button>
          );
        })}
      </div>

      {selectedAmount !== null && (
        <CheckoutForm
          staffId={staffId}
          amount={selectedAmount}
          currency={currency}
          nonce={nonce}
        />
      )}
    </div>
  );
}
