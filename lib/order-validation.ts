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
  account: {
    full_name: string;
    email: string;
    password: string;
  };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Common EU VAT format: 2-letter country code + 2-12 alphanumerics.
// Loose — Stripe does the real validation.
const VAT_RE = /^[A-Z]{2}[A-Z0-9]{2,12}$/;

export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

export function isValidPassword(v: string): boolean {
  return typeof v === 'string' && v.length >= 8;
}

export function isValidVat(v: string): boolean {
  if (!v) return true; // optional
  return VAT_RE.test(v.trim().toUpperCase());
}

export function isValidAddress(a: Address | undefined | null): a is Address {
  if (!a) return false;
  return (
    a.line1.trim().length > 2 &&
    a.city.trim().length > 1 &&
    a.postal_code.trim().length >= 3 &&
    a.country.trim().length === 2
  );
}

export function validatePack(pack: unknown): pack is PackId {
  return pack === 's' || pack === 'm' || pack === 'l';
}

export function validateShipping(state: OrderState): string | null {
  if (!isValidAddress(state.shipping)) return 'shipping_invalid';
  return null;
}

export function validateBilling(state: OrderState): string | null {
  if (!state.business.legal_name.trim()) return 'legal_name_required';
  if (!isValidVat(state.business.vat_number)) return 'vat_invalid';
  if (!state.business.billing_same && !isValidAddress(state.business.billing)) {
    return 'billing_invalid';
  }
  return null;
}

export function validateAccount(state: OrderState): string | null {
  if (state.account.full_name.trim().length < 2) return 'full_name_required';
  if (!isValidEmail(state.account.email)) return 'email_invalid';
  if (!isValidPassword(state.account.password)) return 'password_too_short';
  return null;
}

export function validateAll(state: OrderState): string | null {
  return (
    validateShipping(state) ||
    validateBilling(state) ||
    validateAccount(state)
  );
}

export const STEPS = ['pack', 'shipping', 'billing', 'account', 'review'] as const;
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
    account: { full_name: '', email: '', password: '' },
  };
}
