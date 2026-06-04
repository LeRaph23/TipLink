import 'server-only';
import { stripe, CONNECT_BUSINESS_PROFILE } from './client';
import { getBaseUrl } from '@/lib/env';

// Helpers for Stripe **Standard** connected accounts. Standard accounts carry
// no per-account monthly fee and no per-payout fee (unlike Express/Custom),
// and Stripe pays the account holder automatically. Onboarding — identity,
// bank details, terms — is fully Stripe-hosted via Account Links.

export type AccountLinkUrls = { refresh_url: string; return_url: string };

// Where Stripe sends the staff member back after the hosted onboarding.
// Pass the caller's locale so a non-French user lands on their own dashboard.
export function staffBankingReturnUrls(locale: string = 'fr'): AccountLinkUrls {
  const base = getBaseUrl();
  return {
    refresh_url: `${base}/${locale}/dashboard/banking?stripe=refresh`,
    return_url: `${base}/${locale}/dashboard/banking?stripe=return`,
  };
}

// Creates a Standard connected account and returns its id. The account holder
// fills in everything else through the hosted onboarding.
//
// `businessType: 'individual'` pre-sets the account as a private individual, so
// Stripe's hosted onboarding skips the "business type" question and the whole
// company section — used for salon staff, who receive tips as individuals and
// are not businesses. Ambassadors/commercials omit it (they pick their own
// status, e.g. micro-entreprise, since they're paid commissions).
export async function createStandardAccount(opts: {
  email?: string;
  metadata?: Record<string, string>;
  businessType?: 'individual' | 'company' | 'non_profit';
}): Promise<string> {
  const account = await stripe.accounts.create({
    type: 'standard',
    country: 'FR',
    ...(opts.email ? { email: opts.email } : {}),
    ...(opts.businessType ? { business_type: opts.businessType } : {}),
    business_profile: { ...CONNECT_BUSINESS_PROFILE },
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
  });
  return account.id;
}

// Creates a hosted onboarding (or update) link for a connected account.
export async function createOnboardingLink(
  accountId: string,
  urls: AccountLinkUrls,
  type: 'account_onboarding' | 'account_update' = 'account_onboarding',
): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: urls.refresh_url,
    return_url: urls.return_url,
    type,
    // Collect only what is strictly due right now (identity + bank details)
    // rather than every eventually-due field, to keep onboarding as light as
    // possible for staff. Stripe asks for anything else only if it ever becomes
    // actually required to keep paying out.
    collection_options: { fields: 'currently_due' },
  });
  return link.url;
}
