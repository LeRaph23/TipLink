import { describe, it, expect } from 'vitest';
import { parseFrenchAddress } from '@/lib/address';

describe('parseFrenchAddress', () => {
  it('splits a standard IGN label', () => {
    expect(parseFrenchAddress('2 Rue du Général Leclerc, 68170 Rixheim')).toEqual({
      line1: '2 Rue du Général Leclerc',
      postalCode: '68170',
      city: 'Rixheim',
    });
  });

  it('keeps everything before the last comma as line1', () => {
    expect(parseFrenchAddress('Centre Commercial, 12 Avenue de la Gare, 75012 Paris')).toEqual({
      line1: 'Centre Commercial, 12 Avenue de la Gare',
      postalCode: '75012',
      city: 'Paris',
    });
  });

  it('handles a multi-word city', () => {
    expect(parseFrenchAddress('5 Place Kléber, 68390 Sausheim Le Haut')).toEqual({
      line1: '5 Place Kléber',
      postalCode: '68390',
      city: 'Sausheim Le Haut',
    });
  });

  // A guessed address is verification material Stripe will act on, so anything
  // that does not clearly parse is left for the manager to fill in.
  it.each([
    ['no comma at all', '2 Rue du Général Leclerc 68170 Rixheim'],
    ['no postal code', '2 Rue du Général Leclerc, Rixheim'],
    ['postal code but no city', '2 Rue du Général Leclerc, 68170'],
    ['empty street', ', 68170 Rixheim'],
    ['four-digit code', '2 Rue du Test, 6817 Rixheim'],
  ])('returns null when %s', (_label, input) => {
    expect(parseFrenchAddress(input)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseFrenchAddress('')).toBeNull();
    expect(parseFrenchAddress(null)).toBeNull();
    expect(parseFrenchAddress(undefined)).toBeNull();
  });
});
