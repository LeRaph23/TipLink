import { describe, it, expect } from 'vitest';
import { isBusinessPlace } from '@/lib/google-places';

describe('isBusinessPlace', () => {
  it('keeps business listings', () => {
    expect(isBusinessPlace(['hair_care', 'point_of_interest', 'establishment'])).toBe(true);
    expect(isBusinessPlace(['restaurant', 'food', 'point_of_interest', 'establishment'])).toBe(true);
    expect(isBusinessPlace(['beauty_salon', 'establishment'])).toBe(true);
  });

  // The reported case: searching "Test" answered with "12 Rue de Rivoli,
  // 59800 Lille". It carries a place id, so it looked pickable, and the review
  // link it produced would open on a listing that does not exist.
  it('drops geocoded addresses and map locations', () => {
    expect(isBusinessPlace(['street_address'])).toBe(false);
    expect(isBusinessPlace(['premise'])).toBe(false);
    expect(isBusinessPlace(['subpremise'])).toBe(false);
    expect(isBusinessPlace(['route'])).toBe(false);
    expect(isBusinessPlace(['locality', 'political'])).toBe(false);
    expect(isBusinessPlace(['postal_code'])).toBe(false);
    expect(isBusinessPlace([])).toBe(false);
  });

  // A point_of_interest that is not an establishment — a monument, a park
  // entrance — cannot hold reviews for a salon either.
  it('is not fooled by point_of_interest alone', () => {
    expect(isBusinessPlace(['point_of_interest'])).toBe(false);
  });

  // Absent means our field mask failed, not that Google called it a street.
  // Failing closed there would empty the picker for every manager at once.
  it('keeps the result when the field did not come back', () => {
    expect(isBusinessPlace(undefined)).toBe(true);
  });
});
