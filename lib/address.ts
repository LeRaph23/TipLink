import 'server-only';

/**
 * The pieces Stripe wants for an address, as far as we can recover them from
 * the single line the wizard stores.
 */
export type ParsedAddress = {
  line1: string;
  postalCode: string;
  city: string;
};

/**
 * Splits a French address label into the fields Stripe's onboarding asks for.
 *
 * The wizard stores one string, because that is what the IGN geocoder hands
 * back and what a manager typing by hand produces. Stripe wants line1, postal
 * code and city separately, and only skips the question when it has all three.
 *
 * The IGN label format is stable — "12 Rue de la Paix, 75002 Paris" — so this
 * reads the last comma-separated chunk as "<5 digits> <city>" and treats
 * everything before it as the street. Anything that does not match that shape
 * returns null rather than a guess: an address is verification material, and a
 * mangled one costs the manager more than an empty one.
 */
export function parseFrenchAddress(raw: string | null | undefined): ParsedAddress | null {
  if (!raw) return null;

  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const tail = parts[parts.length - 1];
  const match = /^(\d{5})\s+(.+)$/.exec(tail);
  if (!match) return null;

  const [, postalCode, city] = match;
  const line1 = parts.slice(0, -1).join(', ').trim();
  if (!line1 || !city.trim()) return null;

  return { line1, postalCode, city: city.trim() };
}
