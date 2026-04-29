import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  isValidPassword,
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

describe('password', () => {
  it('rejects < 8 chars', () => {
    expect(isValidPassword('short')).toBe(false);
    expect(isValidPassword('1234567')).toBe(false);
  });
  it('accepts >= 8 chars', () => {
    expect(isValidPassword('12345678')).toBe(true);
    expect(isValidPassword('correcthorsebatterystaple')).toBe(true);
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

  it('validateAccount requires name, email, password', () => {
    expect(validateAccount(base)).toBe('full_name_required');

    const noEmail = { ...base, account: { ...base.account, full_name: 'Marco' } };
    expect(validateAccount(noEmail)).toBe('email_invalid');

    const badPwd = { ...base, account: { full_name: 'Marco', email: 'a@b.co', password: '123' } };
    expect(validateAccount(badPwd)).toBe('password_too_short');

    const ok = { ...base, account: { full_name: 'Marco', email: 'a@b.co', password: '12345678' } };
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
