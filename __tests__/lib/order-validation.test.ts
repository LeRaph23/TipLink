import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  isValidVat,
  isValidAddress,
  validatePack,
  validateShipping,
  validateBilling,
  validateAccount,
  emptyOrder,
  parseStep,
  stepIndex,
  STEPS,
  isValidPostalCode,
} from '@/lib/order-validation';

describe('email', () => {
  it.each([
    ['a@b.co', true],
    ['user+tag@sub.example.com', true],
    ['  trim@me.com  ', true],
    ['no-at', false],
    ['double@@x.com', false],
    ['@missing.com', false],
    ['missing@', false],
  ])('isValidEmail(%s) === %s', (e, ok) => {
    expect(isValidEmail(e)).toBe(ok);
  });
});

describe('vat', () => {
  it('accepts empty (optional)', () => {
    expect(isValidVat('')).toBe(true);
  });
  it.each(['FR12345678901', 'BE0123456789', 'DE123456789'])('accepts %s', (v) => {
    expect(isValidVat(v)).toBe(true);
  });
  it.each(['12345678901', 'F1234567', 'FR', 'XYZ!!'])('rejects %s', (v) => {
    expect(isValidVat(v)).toBe(false);
  });
});

describe('address', () => {
  it('requires line1, city, postal_code, 2-char country', () => {
    expect(isValidAddress({
      line1: '1 rue de la Paix', city: 'Paris', postal_code: '75001', country: 'FR',
    })).toBe(true);
    expect(isValidAddress({
      line1: '', city: 'Paris', postal_code: '75001', country: 'FR',
    })).toBe(false);
    expect(isValidAddress({
      line1: '1 rue', city: 'P', postal_code: '75001', country: 'FR',
    })).toBe(false);
    expect(isValidAddress({
      line1: '1 rue', city: 'Paris', postal_code: '75001', country: 'FRANCE',
    })).toBe(false);
  });
});

describe('validatePack', () => {
  it.each(['solo', 'duo'])('accepts %s', (p) => expect(validatePack(p)).toBe(true));
  it.each(['s', 'm', 'l', 'Solo', '', 'foo', null, undefined, 42])('rejects %s', (p) => {
    expect(validatePack(p)).toBe(false);
  });
});

describe('step validators', () => {
  const base = emptyOrder('solo');

  it('validateShipping requires a complete address', () => {
    expect(validateShipping(base)).toBe('shipping_invalid');
    const ok = {
      ...base,
      shipping: { line1: '1 rue Lafayette', line2: '', city: 'Paris', postal_code: '75009', country: 'FR' },
    };
    expect(validateShipping(ok)).toBeNull();
  });

  it('validateBilling requires legal_name and valid VAT', () => {
    expect(validateBilling(base)).toBe('legal_name_required');

    const noVat = { ...base, business: { ...base.business, legal_name: 'Acme' } };
    expect(validateBilling(noVat)).toBeNull();

    const badVat = { ...base, business: { ...base.business, legal_name: 'Acme', vat_number: '1234' } };
    expect(validateBilling(badVat)).toBe('vat_invalid');

    const badBilling = {
      ...base,
      business: {
        ...base.business,
        legal_name: 'Acme',
        billing_same: false,
        billing: { line1: '', city: '', postal_code: '', country: 'FR' },
      },
    };
    expect(validateBilling(badBilling)).toBe('billing_invalid');
  });

  // The password this used to check is gone: the account is created by a
  // six-digit code sent to the address, so a name and a reachable address are
  // everything the step can validate on its own.
  it('validateAccount requires a name and an email', () => {
    expect(validateAccount(base)).toBe('full_name_required');

    const noEmail = { ...base, account: { ...base.account, full_name: 'Marco' } };
    expect(validateAccount(noEmail)).toBe('email_invalid');

    const ok = { ...base, account: { full_name: 'Marco', email: 'a@b.co' } };
    expect(validateAccount(ok)).toBeNull();
  });
});

describe('step helpers', () => {
  it('parseStep falls back to pack', () => {
    expect(parseStep('shipping')).toBe('shipping');
    expect(parseStep('bogus')).toBe('pack');
    expect(parseStep(null)).toBe('pack');
  });
  it('stepIndex matches STEPS', () => {
    expect(stepIndex('pack')).toBe(0);
    expect(stepIndex('review')).toBe(STEPS.length - 1);
  });
});

describe('isValidPostalCode', () => {
  it('requires five digits in France', () => {
    expect(isValidPostalCode('68100', 'FR')).toBe(true);
    expect(isValidPostalCode('6810', 'FR')).toBe(false);
    expect(isValidPostalCode('ABCDE', 'FR')).toBe(false);
  });
  it('stays loose elsewhere', () => {
    expect(isValidPostalCode('1000', 'BE')).toBe(true);
    expect(isValidPostalCode('D02 X285', 'IE')).toBe(true);
    expect(isValidPostalCode('12', 'DE')).toBe(false);
  });
});

describe('per-country checks (QA run: "ABC" and "FR123" went through)', () => {
  it('rejects a French VAT number with the wrong length', () => {
    expect(isValidVat('FR123')).toBe(false);
    expect(isValidVat('FR 12 345 678 901')).toBe(true);
    expect(isValidVat('NL123456789B01')).toBe(true);
    expect(isValidVat('CHE-123.456.789 TVA')).toBe(true);
    expect(isValidVat('XX123456789')).toBe(false);
  });

  it('checks postal codes against the country', () => {
    expect(isValidPostalCode('ABC', 'FR')).toBe(false);
    expect(isValidPostalCode('1012 AB', 'NL')).toBe(true);
    expect(isValidPostalCode('1000-001', 'PT')).toBe(true);
    expect(isValidPostalCode('L-1234', 'LU')).toBe(true);
    expect(isValidPostalCode('75009', 'BE')).toBe(false);
  });

  it('says which part of the address is wrong', () => {
    const base = emptyOrder('solo');
    const badPostal = { ...base, shipping: { line1: '1 rue Lafayette', city: 'Paris', postal_code: 'ABC', country: 'FR' } };
    expect(validateShipping(badPostal)).toBe('shipping_postal_invalid');
  });
});
