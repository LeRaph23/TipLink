// Pure validation functions for the onboarding wizard.
// Keep them free of React / next-intl so they can be unit-tested easily.

import type { PackId } from './env';

export type Address = {
  line1: string;
  line2?: string;
  city: string;
  postal_code: string;
  country: string;
};

export type OrderState = {
  pack: PackId;
  shipping: Address;
  business: {
    legal_name: string;
    vat_number: string;
    billing_same: boolean;
    billing?: Address;
  };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// VAT numbers, by country, in the shape VIES uses after the prefix. The
// payment step still asks VIES whether the number exists (lib/tax/vies.ts);
// this only stops an obviously wrong one at the form, where it can be fixed,
// instead of silently falling back to French VAT at checkout.
const VAT_FORMATS: Record<string, RegExp> = {
  AT: /^U\d{8}$/, BE: /^[01]\d{9}$/, BG: /^\d{9,10}$/, CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/, DE: /^\d{9}$/, DK: /^\d{8}$/, EE: /^\d{9}$/,
  EL: /^\d{9}$/, GR: /^\d{9}$/, ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/, FI: /^\d{8}$/,
  FR: /^[A-HJ-NP-Z0-9]{2}\d{9}$/, HR: /^\d{11}$/, HU: /^\d{8}$/,
  IE: /^(\d{7}[A-W][A-I]?|\d[A-Z+*]\d{5}[A-W])$/, IT: /^\d{11}$/,
  LT: /^(\d{9}|\d{12})$/, LU: /^\d{8}$/, LV: /^\d{11}$/, MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/, PL: /^\d{10}$/, PT: /^\d{9}$/, RO: /^\d{2,10}$/,
  SE: /^\d{12}$/, SI: /^\d{8}$/, SK: /^\d{10}$/, XI: /^(\d{9}|\d{12})$/,
  // Swiss UID: CHE-123.456.789, optionally followed by MWST / TVA / IVA.
  CH: /^E\d{9}(MWST|TVA|IVA)?$/,
};

export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

export function isValidVat(v: string): boolean {
  if (!v || !v.trim()) return true; // optional
  const n = v.toUpperCase().replace(/[\s.\-]/g, '');
  const format = VAT_FORMATS[n.slice(0, 2)];
  return !!format && format.test(n.slice(2));
}

export function isValidAddress(a: Address | undefined | null): a is Address {
  return addressProblem(a) === null;
}

/** What is wrong with an address, so the form can say it: missing parts, or a postal code that does not fit the country. */
export function addressProblem(a: Address | undefined | null): 'incomplete' | 'postal' | null {
  if (!a) return 'incomplete';
  if (a.line1.trim().length <= 2 || a.city.trim().length <= 1 || a.country.trim().length !== 2 || !a.postal_code.trim()) {
    return 'incomplete';
  }
  return isValidPostalCode(a.postal_code, a.country) ? null : 'postal';
}

// Postal code shapes for the countries we ship to (components/checkout/
// PackCheckout.tsx). A mistyped code is the commonest reason a plaque comes
// back to sender. Anything else gets a loose check.
const POSTAL_FORMATS: Record<string, RegExp> = {
  FR: /^\d{5}$/, BE: /^\d{4}$/, LU: /^(L-?)?\d{4}$/, CH: /^\d{4}$/,
  DE: /^\d{5}$/, ES: /^\d{5}$/, IT: /^\d{5}$/, NL: /^\d{4} ?[A-Z]{2}$/,
  PT: /^\d{4}-?\d{3}$/, AT: /^\d{4}$/, FI: /^\d{5}$/, GR: /^\d{3} ?\d{2}$/,
  IE: /^[A-Z0-9]{3} ?[A-Z0-9]{4}$/,
};

export function isValidPostalCode(code: string, country: string): boolean {
  const c = code.trim().toUpperCase();
  const format = POSTAL_FORMATS[country.trim().toUpperCase()];
  return format ? format.test(c) : c.length >= 3;
}

export function validatePack(pack: unknown): pack is PackId {
  return pack === 'solo' || pack === 'duo';
}

export function validateShipping(state: OrderState): string | null {
  const problem = addressProblem(state.shipping);
  if (problem === 'postal') return 'shipping_postal_invalid';
  if (problem) return 'shipping_invalid';
  return null;
}

export function validateBilling(state: OrderState): string | null {
  if (!state.business.legal_name.trim()) return 'legal_name_required';
  if (!isValidVat(state.business.vat_number)) return 'vat_invalid';
  if (!state.business.billing_same) {
    const problem = addressProblem(state.business.billing);
    if (problem === 'postal') return 'billing_postal_invalid';
    if (problem) return 'billing_invalid';
  }
  return null;
}

export function validateAll(state: OrderState): string | null {
  return (
    validateShipping(state) ||
    validateBilling(state)
  );
}

export const STEPS = ['pack', 'shipping', 'billing', 'review'] as const;
export type Step = (typeof STEPS)[number];

export function parseStep(v: unknown): Step {
  return STEPS.includes(v as Step) ? (v as Step) : 'pack';
}

export function stepIndex(s: Step): number {
  return STEPS.indexOf(s);
}

export function emptyOrder(pack: PackId): OrderState {
  return {
    pack,
    shipping: { line1: '', line2: '', city: '', postal_code: '', country: 'FR' },
    business: { legal_name: '', vat_number: '', billing_same: true },
  };
}
