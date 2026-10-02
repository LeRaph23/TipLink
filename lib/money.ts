// Amounts on pages that hydrate (the tip page) must render the same text on
// the server and in the browser. Intl.NumberFormat depends on the ICU data of
// the runtime: a Node built without full ICU formats `fr-FR` as "€2" while the
// browser says "2 €", and React throws a hydration error on every amount
// (seventh QA run). EUR, GBP and USD are formatted by hand here; any other
// currency falls back to Intl.

const SYMBOLS: Record<string, string> = { EUR: '€', GBP: '£', USD: '$' };
const NBSP = ' ';
const NNBSP = ' ';

export type MoneyFormatter = { format: (amount: number) => string };

/**
 * A drop-in for `new Intl.NumberFormat(locale, { style: 'currency', currency,
 * minimumFractionDigits })`, deterministic for the currencies we sell in.
 * `minFractionDigits: 0` drops the decimals of whole amounts only ("2 €",
 * "12,50 €").
 */
export function moneyFormatter(
  locale: string,
  currency: string,
  minFractionDigits: 0 | 2 = 2,
): MoneyFormatter {
  const cur = currency.toUpperCase();
  const fr = locale.toLowerCase().startsWith('fr');
  const symbol = SYMBOLS[cur];
  if (!symbol) {
    const intl = new Intl.NumberFormat(fr ? 'fr-FR' : 'en-GB', {
      style: 'currency', currency: cur, minimumFractionDigits: minFractionDigits,
    });
    return { format: (n) => intl.format(n) };
  }
  return {
    format(amount: number) {
      const negative = amount < 0;
      const cents = Math.round(Math.abs(amount) * 100);
      const whole = Math.floor(cents / 100);
      const frac = cents % 100;
      const showDecimals = minFractionDigits === 2 || frac !== 0;
      const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, fr ? NNBSP : ',');
      const number = showDecimals
        ? `${grouped}${fr ? ',' : '.'}${String(frac).padStart(2, '0')}`
        : grouped;
      const sign = negative ? '-' : '';
      return fr ? `${sign}${number}${NBSP}${symbol}` : `${sign}${symbol}${number}`;
    },
  };
}
