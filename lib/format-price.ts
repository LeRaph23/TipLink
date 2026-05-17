export function formatPriceCents(
  cents: number,
  currency: string,
  locale: string = 'fr'
): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

// Pack prices are stored and displayed excl. VAT — VAT is added at checkout
// based on the customer's country. This is the short label for that.
export function htSuffix(locale?: string): string {
  return locale === 'fr' ? 'HT' : 'excl. VAT';
}
