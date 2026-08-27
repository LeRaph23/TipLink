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
 * Splits a French address line into the fields Stripe's onboarding asks for.
 *
 * The wizard stores one string, because that is what its two sources produce.
 * They do not agree on punctuation, which is the whole difficulty:
 *
 *   IGN geocoder    9 Impasse Saint-léger 68130 Jettingen     (no commas)
 *   Google Places   2 Rue du Général Leclerc, 68170 Rixheim   (commas, sometimes
 *                                                              a trailing country)
 *
 * An earlier version of this keyed on comma structure and so returned null for
 * every address picked from the autocomplete — which is the path nearly every
 * manager takes. Anchoring on the postal code instead is what both formats
 * actually have in common.
 *
 * The LAST five-digit group is the postal code: a street number can be five
 * digits too, but never after it. Whatever follows is the city, up to a comma,
 * so a trailing ", France" does not end up as the town.
 *
 * Returns null rather than a guess when there is no postal code, no street or
 * no city. An address is verification material Stripe acts on, so a mangled one
 * costs the manager more than an empty one.
 */
export function parseFrenchAddress(raw: string | null | undefined): ParsedAddress | null {
  const value = raw?.trim();
  if (!value) return null;

  let postal: RegExpMatchArray | undefined;
  for (const m of value.matchAll(/\b\d{5}\b/g)) postal = m;
  if (!postal || postal.index === undefined) return null;

  const line1 = value.slice(0, postal.index).replace(/[\s,]+$/, '').trim();
  const city = value
    .slice(postal.index + postal[0].length)
    .replace(/^[\s,]+/, '')
    .split(',')[0]
    .trim();

  if (!line1 || !city) return null;

  return { line1, postalCode: postal[0], city };
}
