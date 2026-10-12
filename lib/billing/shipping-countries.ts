// The countries /checkout ships packs to. Switzerland ships too: an export,
// invoiced without French VAT (Swiss import VAT and any duties are the
// buyer's, see CGV section 5).
export const SHIPPING_COUNTRIES = ['FR', 'BE', 'IE', 'ES', 'DE', 'IT', 'NL', 'LU', 'PT', 'AT', 'FI', 'GR', 'CH'] as const;

export type ShippingCountry = (typeof SHIPPING_COUNTRIES)[number];

export function isShippingCountry(c: string | null | undefined): c is ShippingCountry {
  return !!c && (SHIPPING_COUNTRIES as readonly string[]).includes(c);
}
