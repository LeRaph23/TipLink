import { beforeEach, describe, expect, it, vi } from 'vitest';

const calcCreate = vi.fn();
vi.mock('@/lib/stripe/client', () => ({ stripe: { tax: { calculations: { create: (...a: unknown[]) => calcCreate(...a) } } } }));

import { computePackTax, needsVatFloor } from '@/lib/stripe/tax';

describe('needsVatFloor', () => {
  it('never lets a French sale through at 0 %', () => {
    expect(needsVatFloor('FR', 0, 6900, false)).toBe(true);
    expect(needsVatFloor('fr', 0, 6900, true)).toBe(true);
  });
  it('charges French VAT to an EU buyer without a VAT number', () => {
    expect(needsVatFloor('BE', 0, 6900, false)).toBe(true);
  });
  it('accepts 0 % for an EU business (reverse charge) and outside the EU', () => {
    expect(needsVatFloor('BE', 0, 6900, true)).toBe(false);
    expect(needsVatFloor('CH', 0, 6900, false)).toBe(false);
    expect(needsVatFloor('US', 0, 6900, false)).toBe(false);
  });
  it('leaves a real VAT answer and free orders alone', () => {
    expect(needsVatFloor('FR', 1380, 6900, false)).toBe(false);
    expect(needsVatFloor('FR', 0, 0, false)).toBe(false);
  });
});

describe('computePackTax', () => {
  beforeEach(() => calcCreate.mockReset());

  it('applies 20 % when Stripe Tax has no French registration', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    calcCreate.mockResolvedValue({ id: 'taxcalc_1', tax_amount_exclusive: 0, amount_total: 6900 });
    const tax = await computePackTax({ htAmount: 6900, currency: 'eur', country: 'FR' });
    expect(tax).toMatchObject({ htAmount: 6900, taxAmount: 1380, totalAmount: 8280, taxRatePercent: 20, country: 'FR' });
  });

  it('keeps Stripe Tax answer when it charges VAT', async () => {
    calcCreate.mockResolvedValue({ id: 'taxcalc_2', tax_amount_exclusive: 1380, amount_total: 8280 });
    const tax = await computePackTax({ htAmount: 6900, currency: 'eur', country: 'FR' });
    expect(tax).toMatchObject({ taxAmount: 1380, totalAmount: 8280, calculationId: 'taxcalc_2' });
  });

  it('keeps reverse charge for a Belgian business', async () => {
    calcCreate.mockResolvedValue({ id: 'taxcalc_3', tax_amount_exclusive: 0, amount_total: 6900 });
    const tax = await computePackTax({ htAmount: 6900, currency: 'eur', country: 'BE', vatNumber: 'BE0123456749' });
    expect(tax).toMatchObject({ taxAmount: 0, totalAmount: 6900 });
  });
});
