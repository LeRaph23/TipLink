import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveListAmount } from '@/lib/stripe/pricing';
import { PACKS } from '@/lib/env';

// The strikethrough reference price used to be computed as `unitAmount + 3000`,
// which manufactured a ~30% discount regardless of the real tariff. It now comes
// from a value a human sets — Stripe product metadata, or the catalogue in
// lib/env.ts — because art. L112-1-1 requires the announced reference to be a
// price actually charged.

describe('resolveListAmount', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('prefers the Stripe product metadata over the catalogue fallback', () => {
    expect(resolveListAmount({ list_price_cents: '12900' }, 6900, 'solo')).toBe(12900);
  });

  it('falls back to the catalogue list price when no metadata is set', () => {
    expect(resolveListAmount(undefined, 6900, 'solo')).toBe(PACKS.solo.listAmount);
    expect(resolveListAmount({}, 9900, 'duo')).toBe(PACKS.duo.listAmount);
  });

  it('treats a blank metadata value as unset', () => {
    expect(resolveListAmount({ list_price_cents: '   ' }, 6900, 'solo')).toBe(
      PACKS.solo.listAmount
    );
  });

  it('never returns a reference at or below the charged price', () => {
    // A "discount" against a lower reference is not a discount.
    expect(resolveListAmount({ list_price_cents: '6900' }, 6900, 'solo')).toBeNull();
    expect(resolveListAmount({ list_price_cents: '5000' }, 6900, 'solo')).toBeNull();
  });

  it('returns null and logs when the metadata is not a usable integer', () => {
    expect(resolveListAmount({ list_price_cents: 'abc' }, 6900, 'solo')).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('does not silently fall back when metadata is present but invalid', () => {
    // Falling back here would show a strikethrough the operator thought they
    // had overridden — worse than showing none.
    expect(resolveListAmount({ list_price_cents: '0' }, 6900, 'solo')).toBeNull();
  });

  it('returns null when the catalogue fallback is not above the charged price', () => {
    expect(resolveListAmount(undefined, 99_999, 'solo')).toBeNull();
  });
});
