'use client';

import { TipPaymentForm } from './TipPaymentForm';

interface Props {
  establishmentId: string;
  amount: number;    // total charge in cents = tipAmount + service fee
  tipAmount: number; // the tip the customer selected, in cents
  currency: string;
}

export function GroupTipCheckout({ establishmentId, amount, tipAmount, currency }: Props) {
  return (
    <TipPaymentForm
      endpoint="/api/stripe/create-group-intent"
      body={{ establishmentId, tipAmount }}
      amount={amount}
      currency={currency}
    />
  );
}
