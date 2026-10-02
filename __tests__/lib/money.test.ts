import { describe, it, expect } from 'vitest';
import { moneyFormatter } from '@/lib/money';

// For EUR the hand-written output must match a full-ICU Intl, which the
// browser has. GBP and USD use the bare symbol (Intl says "£GB", "US$").
function intl(locale: string, currency: string, min: 0 | 2, n: number) {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency', currency, minimumFractionDigits: min,
  }).format(n);
}

describe('moneyFormatter', () => {
  const amounts = [0.5, 2, 5, 12.34, 12.5, 500, 1234.56, 13.21];
  for (const locale of ['fr', 'en']) {
    for (const currency of ['EUR']) {
      for (const min of [0, 2] as const) {
        it(`matches Intl for ${locale} ${currency} min=${min}`, () => {
          const f = moneyFormatter(locale, currency, min);
          for (const n of amounts) {
            // Intl with min 0 keeps "12.5"; we show "12,50" on purpose.
            if (min === 0 && Math.round(n * 100) % 10 === 0 && Math.round(n * 100) % 100 !== 0) continue;
            expect(f.format(n)).toBe(intl(locale, currency, min, n));
          }
        });
      }
    }
  }

  it('uses the bare symbol for GBP and USD', () => {
    expect(moneyFormatter('fr', 'GBP', 2).format(5)).toBe('5,00\u00a0£');
    expect(moneyFormatter('en', 'USD', 0).format(2)).toBe('$2');
  });

  it('shows two decimals for a fractional amount when decimals are optional', () => {
    expect(moneyFormatter('fr', 'EUR', 0).format(12.5)).toBe('12,50 €');
    expect(moneyFormatter('en', 'EUR', 0).format(2)).toBe('€2');
  });
});
