import Mangopay from 'mangopay4-nodejs-sdk';
import { serverEnv } from '@/lib/env';

// Mangopay SDK singleton. mangopay4-nodejs-sdk targets API v2.01; the legacy
// mangopay2 SDK is deprecated and must not be used.
let cached: Mangopay | null = null;

export function mangopay(): Mangopay {
  if (!cached) {
    const env = serverEnv();
    cached = new Mangopay({
      clientId: env.MANGOPAY_CLIENT_ID,
      clientApiKey: env.MANGOPAY_API_KEY,
      baseUrl: env.MANGOPAY_BASE_URL,
    });
  }
  return cached;
}

// The platform Legal User and the central collection wallet — every PayIn
// credits this wallet and every payout Transfer debits it. Created once by
// `npm run setup:mangopay`.
export function platformIds(): { userId: string; walletId: string } {
  const env = serverEnv();
  return {
    userId: env.MANGOPAY_PLATFORM_USER_ID,
    walletId: env.MANGOPAY_CENTRAL_WALLET_ID,
  };
}

// All wallets and transactions on the platform are EUR.
export const CURRENCY = 'EUR' as const;

// Builds a Mangopay MoneyData object (amounts are always in minor units/cents).
export function money(amount: number): { Currency: 'EUR'; Amount: number } {
  return { Currency: CURRENCY, Amount: amount };
}
