import { describe, it, expect } from 'vitest';
import { parseFrenchAddress } from '@/lib/address';

describe('parseFrenchAddress', () => {
  // The address step's autocomplete is the IGN geocoder, and its labels carry
  // no punctuation at all. This is the shape nearly every stored address has,
  // and the one the first version of this parser rejected outright — verified
  // against the live endpoint, not assumed.
  it('parses an IGN label, which has no commas', () => {
    expect(parseFrenchAddress('9 Impasse Saint-léger 68130 Jettingen')).toEqual({
      line1: '9 Impasse Saint-léger',
      postalCode: '68130',
      city: 'Jettingen',
    });
  });

  it('parses a Google Places formattedAddress, which has them', () => {
    expect(parseFrenchAddress('2 Rue du Général Leclerc, 68170 Rixheim')).toEqual({
      line1: '2 Rue du Général Leclerc',
      postalCode: '68170',
      city: 'Rixheim',
    });
  });

  it('drops a trailing country so it never lands in the city', () => {
    expect(parseFrenchAddress('2 Rue du Général Leclerc, 68170 Rixheim, France')).toEqual({
      line1: '2 Rue du Général Leclerc',
      postalCode: '68170',
      city: 'Rixheim',
    });
  });

  it('keeps everything before the postal code as line1', () => {
    expect(parseFrenchAddress('Centre Commercial, 12 Avenue de la Gare, 75012 Paris')).toEqual({
      line1: 'Centre Commercial, 12 Avenue de la Gare',
      postalCode: '75012',
      city: 'Paris',
    });
  });

  it('handles a multi-word city', () => {
    expect(parseFrenchAddress('5 Place Kléber 68390 Sausheim Le Haut')).toEqual({
      line1: '5 Place Kléber',
      postalCode: '68390',
      city: 'Sausheim Le Haut',
    });
  });

  // A five-digit street number exists; a postal code always comes after it.
  it('takes the last five-digit group as the postal code', () => {
    expect(parseFrenchAddress('12345 Route de Test 68130 Jettingen')).toEqual({
      line1: '12345 Route de Test',
      postalCode: '68130',
      city: 'Jettingen',
    });
  });

  // A guessed address is verification material Stripe acts on, so anything
  // that does not clearly parse is left for the manager to fill in.
  it.each([
    ['no postal code', '9 Impasse Saint-léger Jettingen'],
    ['postal code but no city', '9 Impasse Saint-léger 68130'],
    ['no street before the code', '68130 Jettingen'],
    ['four-digit code', '9 Impasse Saint-léger 6813 Jettingen'],
    ['digits glued to a word', '9 Impasse Saint-léger A68130 Jettingen'],
  ])('returns null when %s', (_label, input) => {
    expect(parseFrenchAddress(input)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseFrenchAddress('')).toBeNull();
    expect(parseFrenchAddress('   ')).toBeNull();
    expect(parseFrenchAddress(null)).toBeNull();
    expect(parseFrenchAddress(undefined)).toBeNull();
  });
});
