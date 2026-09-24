import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

vi.mock('@/lib/stripe/client', () => ({ stripe: {} }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }));

import {
  creditNoteLine,
  invoiceLine,
  keptFeeCents,
  splitInclusive,
  summarize,
  vatLinesToCsv,
} from '@/lib/billing/vat-report';

const invoice = (o: Partial<Stripe.Invoice>) =>
  ({
    id: 'in_1', number: 'X-0001', created: 1757548800, status_transitions: { finalized_at: 1757548800 },
    customer_name: 'Mohamed', customer_email: null, customer_address: { country: 'FR' },
    total: 7900, total_excluding_tax: 7900, total_taxes: [], ...o,
  }) as unknown as Stripe.Invoice;

describe('splitInclusive', () => {
  it('extracts 20 % VAT from an inclusive amount', () => {
    expect(splitInclusive(7900)).toEqual({ htCents: 6583, vatCents: 1317 });
    expect(splitInclusive(75)).toEqual({ htCents: 62, vatCents: 13 });
  });
});

describe('keptFeeCents', () => {
  it('keeps the whole fee when nothing was refunded', () => {
    expect(keptFeeCents(75, 1075, 0)).toBe(75);
  });
  it('returns nothing after a full refund', () => {
    expect(keptFeeCents(75, 1075, 1075)).toBe(0);
  });
  it('keeps the fee in proportion to what was not refunded', () => {
    expect(keptFeeCents(100, 1000, 500)).toBe(50);
  });
});

describe('the corrected-invoice case nets out', () => {
  // Real case: an invoice issued without VAT, cancelled by a credit note and
  // reissued VAT-inclusive for the same 79 €.
  const lines = [
    invoiceLine(invoice({ number: '0001' })),
    creditNoteLine(
      { number: '0001-CN-01', created: 1758700000, total: 7900, total_excluding_tax: 7900, total_taxes: [] } as unknown as Stripe.CreditNote,
      invoice({ number: '0001' }),
    ),
    invoiceLine(invoice({ number: '0002', total: 7900, total_excluding_tax: 6583, total_taxes: [{ amount: 1317 }] as never })),
  ];

  it('declares 65,83 € HT and 13,17 € VAT at 20 %, nothing without VAT', () => {
    const s = summarize(2026, lines);
    const b20 = s.buckets.find((b) => b.ratePercent === 20)!;
    expect(b20.htCents).toBe(6583);
    expect(b20.vatCents).toBe(1317);
    expect(s.buckets.find((b) => b.ratePercent === 0)?.htCents).toBe(0);
    expect(s.totalVatCents).toBe(1317);
    expect(s.totalTtcCents).toBe(7900);
  });

  it('exports a French CSV', () => {
    const csv = vatLinesToCsv(lines);
    expect(csv.startsWith('﻿Date;Type;')).toBe(true);
    expect(csv).toContain('Avoir Stripe;0001-CN-01;Mohamed;FR;0;-79,00;0,00;-79,00');
    expect(csv).toContain('Facture Stripe;0002;Mohamed;FR;20;65,83;13,17;79,00');
  });
});
