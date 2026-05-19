import { describe, it, expect } from 'vitest';
import { computePackTax } from '@/lib/mangopay/vat';

describe('computePackTax', () => {
  it('applies the destination country standard rate (B2C)', () => {
    const fr = computePackTax({ htAmount: 10_000, country: 'FR' });
    expect(fr.taxRatePercent).toBe(20);
    expect(fr.taxAmount).toBe(2_000);
    expect(fr.totalAmount).toBe(12_000);

    const de = computePackTax({ htAmount: 10_000, country: 'DE' });
    expect(de.taxRatePercent).toBe(19);
    expect(de.totalAmount).toBe(11_900);
  });

  it('is case-insensitive on the country code', () => {
    expect(computePackTax({ htAmount: 10_000, country: 'fr' }).taxAmount).toBe(2_000);
  });

  it('reverse-charges a valid intra-EU VAT id to 0%', () => {
    const t = computePackTax({ htAmount: 10_000, country: 'DE', vatNumber: 'FR12345678901' });
    expect(t.taxRatePercent).toBe(0);
    expect(t.taxAmount).toBe(0);
    expect(t.totalAmount).toBe(10_000);
  });

  it('ignores whitespace in the VAT id', () => {
    const t = computePackTax({ htAmount: 10_000, country: 'DE', vatNumber: 'FR 1234 5678 901' });
    expect(t.taxRatePercent).toBe(0);
  });

  it('charges VAT when the VAT id is malformed', () => {
    const t = computePackTax({ htAmount: 10_000, country: 'FR', vatNumber: 'not-a-vat' });
    expect(t.taxRatePercent).toBe(20);
  });

  it('treats a non-EU destination as a 0% export', () => {
    const t = computePackTax({ htAmount: 10_000, country: 'US' });
    expect(t.taxRatePercent).toBe(0);
    expect(t.totalAmount).toBe(10_000);
  });

  it('returns zero tax for a non-positive base amount', () => {
    const t = computePackTax({ htAmount: 0, country: 'FR' });
    expect(t.taxAmount).toBe(0);
    expect(t.totalAmount).toBe(0);
  });

  it('rounds the VAT amount to the nearest cent', () => {
    // 6900 * 20% = 1380 exactly; 6901 * 20% = 1380.2 -> 1380
    expect(computePackTax({ htAmount: 6_901, country: 'FR' }).taxAmount).toBe(1_380);
  });

  it('never exposes a Stripe-style calculationId', () => {
    expect(computePackTax({ htAmount: 10_000, country: 'FR' }).calculationId).toBeNull();
  });
});
