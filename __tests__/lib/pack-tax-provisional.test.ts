import { describe, it, expect } from 'vitest';
import { provisionalPackTax, DEFAULT_TAX_COUNTRY } from '@/lib/stripe/tax';
import { PACKS } from '@/lib/env';

describe('provisionalPackTax', () => {
  // The concrete regression: a Pack Solo is 69 € HT. The intent used to be
  // created at 69 €, and anything confirming before the address handler ran
  // paid 69 € while Digitip still owed the VAT out of its own margin.
  it('taxes a pack instead of leaving it at the bare HT price', () => {
    const ht = PACKS.solo.hardwareAmount;
    const t = provisionalPackTax(ht);
    expect(t.htAmount).toBe(ht);
    expect(t.taxAmount).toBe(Math.round(ht * 0.2));
    expect(t.totalAmount).toBe(ht + t.taxAmount);
    expect(t.totalAmount).toBeGreaterThan(ht);
  });

  it('uses the seller own country as the provisional jurisdiction', () => {
    expect(provisionalPackTax(6900).country).toBe(DEFAULT_TAX_COUNTRY);
  });

  it('never returns a total below the HT amount', () => {
    for (const ht of [0, 1, 50, 6900, 9900, 999999]) {
      const t = provisionalPackTax(ht);
      expect(t.totalAmount).toBeGreaterThanOrEqual(t.htAmount);
      expect(t.taxAmount).toBeGreaterThanOrEqual(0);
    }
  });

  it('clamps a negative or fractional HT rather than propagating it', () => {
    expect(provisionalPackTax(-500)).toMatchObject({ htAmount: 0, taxAmount: 0, totalAmount: 0 });
    expect(provisionalPackTax(6900.4).htAmount).toBe(6900);
  });

  it('returns whole cents', () => {
    for (const ht of [6900, 9900, 3333, 7777]) {
      const t = provisionalPackTax(ht);
      expect(Number.isInteger(t.taxAmount)).toBe(true);
      expect(Number.isInteger(t.totalAmount)).toBe(true);
    }
  });
});
