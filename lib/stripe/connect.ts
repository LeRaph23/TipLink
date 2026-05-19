import 'server-only';
import { stripe, CONNECT_BUSINESS_PROFILE } from './client';
import { getBaseUrl } from '@/lib/env';

// Helpers for Stripe **Standard** connected accounts. Standard accounts carry
// no per-account monthly fee and no per-payout fee (unlike Express/Custom),
// and Stripe pays the account holder automatically. Onboarding — identity,
// bank details, terms — is fully Stripe-hosted via Account Links.

export type AccountLinkUrls = { refresh_url: string; return_url: string };

// Where Stripe sends the staff member back after the hosted onboarding.
export function staffBankingReturnUrls(): AccountLinkUrls {
  const base = getBaseUrl();
  return {
    refresh_url: `${base}/fr/dashboard/banking?stripe=refresh`,
    return_url: `${base}/fr/dashboard/banking?stripe=return`,
  };
}

// Creates a Standard connected account and returns its id. The account holder
// fills in everything else through the hosted onboarding.
export async function createStandardAccount(opts: {
  email?: string;
  metadata?: Record<string, string>;
}): Promise<string> {
  const account = await stripe.accounts.create({
    type: 'standard',
    country: 'FR',
    ...(opts.email ? { email: opts.email } : {}),
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
  });
  return link.url;
}
