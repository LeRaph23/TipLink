'use client';

import { TipPaymentForm } from './TipPaymentForm';

interface Props {
  staffId: string;
  amount: number;    // total charge in cents = tipAmount + service fee
  tipAmount: number; // the tip the customer selected, in cents
  currency: string;
  // When the page reached this checkout via a group/establishment scan, pass
  // the establishment id so the server can refuse cross-establishment tipping.
  expectedEstablishmentId?: string;
}

export function TipCheckout({ staffId, amount, tipAmount, currency, expectedEstablishmentId }: Props) {
  return (
    <TipPaymentForm
      endpoint="/api/stripe/create-intent"
      body={{ staffId, tipAmount, ...(expectedEstablishmentId ? { expectedEstablishmentId } : {}) }}
      amount={amount}
      currency={currency}
    />
  );
}
