import { describe, it, expect } from 'vitest';
import { validateIban, formatIbanFriendly } from '@/lib/banking/iban';

describe('validateIban', () => {
  describe('valid IBANs', () => {
    it.each([
      ['FR1420041010050500013M02606', 'FR'], // valid FR IBAN
      ['DE89370400440532013000', 'DE'],
      ['ES9121000418450200051332', 'ES'],
      ['BE68539007547034', 'BE'],
      ['NL91ABNA0417164300', 'NL'],
      ['IT60X0542811101000000123456', 'IT'],
      ['PT50000201231234567890154', 'PT'],
    ])('accepts valid IBAN %s', (input, expectedCountry) => {
      const result = validateIban(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.country).toBe(expectedCountry);
        expect(result.normalized).toBe(input.replace(/\s/g, '').toUpperCase());
      }
    });

    it('strips spaces and lowercases input', () => {
      const result = validateIban(' fr14 2004 1010 0505 0001 3m02 606 ');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.normalized).toBe('FR1420041010050500013M02606');
      }
    });
  });

  describe('invalid IBANs', () => {
    it('rejects empty input', () => {
      const result = validateIban('');
      expect(result.ok).toBe(false);
    });

    it('rejects null/undefined', () => {
      expect(validateIban(null).ok).toBe(false);
      expect(validateIban(undefined).ok).toBe(false);
    });

    it('rejects invalid checksum', () => {
      const result = validateIban('FR1420041010050500013M02607'); // last digit wrong
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/checksum/i);
      }
    });

    it('rejects wrong length for country', () => {
      const result = validateIban('FR14200410100505');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/longueur|invalide/i);
      }
    });

    it('rejects non-SEPA country', () => {
      // Valid US-style format but not SEPA
      const result = validateIban('US12345678901234567890');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/SEPA|non support/i);
      }
    });

    it('rejects garbage input', () => {
      expect(validateIban('not an iban').ok).toBe(false);
      expect(validateIban('123').ok).toBe(false);
      expect(validateIban('FR!!!@@@').ok).toBe(false);
    });
  });
});

describe('formatIbanFriendly', () => {
  it('formats IBAN with spaces every 4 chars', () => {
    expect(formatIbanFriendly('FR1420041010050500013M02606'))
      .toBe('FR14 2004 1010 0505 0001 3M02 606');
  });

  it('handles lowercased input', () => {
    expect(formatIbanFriendly('de89370400440532013000'))
      .toBe('DE89 3704 0044 0532 0130 00');
  });
});
