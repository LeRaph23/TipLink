import { describe, it, expect } from 'vitest';
import { inferBusinessType } from '@/lib/google-places';

// The confirmation screen shows this answer with two buttons, so a wrong guess
// costs one tap. What must not happen is the opposite of the truth on the
// obvious cases, which is what these pin.
describe('inferBusinessType', () => {
  it('reads the food trades as restaurants', () => {
    expect(inferBusinessType(['restaurant', 'food', 'point_of_interest', 'establishment'])).toBe('restaurant');
    expect(inferBusinessType(['bar', 'establishment'])).toBe('restaurant');
    expect(inferBusinessType(['cafe', 'coffee_shop', 'establishment'])).toBe('restaurant');
    expect(inferBusinessType(['bakery', 'establishment'])).toBe('restaurant');
  });

  it('reads the grooming trades as beauty', () => {
    expect(inferBusinessType(['hair_salon', 'hair_care', 'establishment'])).toBe('beauty');
    expect(inferBusinessType(['beauty_salon', 'establishment'])).toBe('beauty');
    expect(inferBusinessType(['barber_shop', 'establishment'])).toBe('beauty');
    expect(inferBusinessType(['spa', 'establishment'])).toBe('beauty');
  });

  // A hotel restaurant carries both sets. Guessing "restaurant" is right for
  // the tipping suggestion, which is what the answer feeds.
  it('prefers restaurant when a listing claims both', () => {
    expect(inferBusinessType(['spa', 'restaurant', 'lodging', 'establishment'])).toBe('restaurant');
  });

  // Null means "leave the default alone", not "beauty". The wizard keeps its
  // own default in that case rather than pretending Google answered.
  it('gives up rather than guessing on anything else', () => {
    expect(inferBusinessType(['clothing_store', 'establishment'])).toBeNull();
    expect(inferBusinessType([])).toBeNull();
    expect(inferBusinessType(undefined)).toBeNull();
  });
});
