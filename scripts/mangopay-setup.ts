#!/usr/bin/env npx tsx
/**
 * One-off Mangopay setup. Creates the platform's Legal User (category OWNER),
 * its central EUR collection wallet, and registers the webhook Hooks.
 *
 * Run once after setting the Mangopay credentials in your environment:
 *
 *   npm run setup:mangopay
 *
 * Then copy the printed MANGOPAY_PLATFORM_USER_ID / MANGOPAY_CENTRAL_WALLET_ID
 * lines into your .env.local.
 *
 * Company identity is read from env vars (sandbox-friendly defaults below) —
 * set the real values before running against production.
 */

import Mangopay from 'mangopay4-nodejs-sdk';
import { HOOK_EVENT_TYPES } from '../lib/mangopay/hooks';

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) {
    console.error(`❌  ${name} is not set`);
    process.exit(1);
  }
  return v;
}

const clientId = env('MANGOPAY_CLIENT_ID');
const apiKey = env('MANGOPAY_API_KEY');
const baseUrl = process.env.MANGOPAY_BASE_URL ?? 'https://api.sandbox.mangopay.com';
const appBaseUrl = env('NEXT_PUBLIC_BASE_URL').replace(/\/$/, '');

const api = new Mangopay({ clientId, clientApiKey: apiKey, baseUrl });

// Platform company identity — override via env for production.
const COMPANY = {
  name: process.env.MANGOPAY_PLATFORM_NAME ?? 'TipLink',
  email: env('MANGOPAY_PLATFORM_EMAIL', 'platform@tiplink.app'),
  repFirstName: process.env.MANGOPAY_PLATFORM_REP_FIRST_NAME ?? 'TipLink',
  repLastName: process.env.MANGOPAY_PLATFORM_REP_LAST_NAME ?? 'Operator',
  repBirthday: process.env.MANGOPAY_PLATFORM_REP_BIRTHDAY ?? '1990-01-01',
  countryISO: (process.env.MANGOPAY_PLATFORM_COUNTRY ?? 'FR') as Mangopay.CountryISO,
};

async function main() {
  console.log('Mangopay setup —', baseUrl, '\n');

  // 1. Platform Legal User (OWNER) — holds the central wallet.
  const birthdaySec = Math.floor(new Date(COMPANY.repBirthday).getTime() / 1000);
  const user = await api.Users.create({
    PersonType: 'LEGAL',
    LegalPersonType: 'BUSINESS',
    UserCategory: 'OWNER',
    TermsAndConditionsAccepted: true,
    Name: COMPANY.name,
    Email: COMPANY.email,
    LegalRepresentativeFirstName: COMPANY.repFirstName,
    LegalRepresentativeLastName: COMPANY.repLastName,
    LegalRepresentativeBirthday: birthdaySec,
    LegalRepresentativeNationality: COMPANY.countryISO,
    LegalRepresentativeCountryOfResidence: COMPANY.countryISO,
  } as Mangopay.user.CreateUserLegalOwnerData);
  console.log(`✅  Platform Legal User: ${user.Id}`);

  // 2. Central EUR collection wallet — every PayIn credits this wallet.
  const wallet = await api.Wallets.create({
    Owners: [user.Id],
    Currency: 'EUR',
    Description: 'TipLink central collection wallet',
  });
  console.log(`✅  Central wallet: ${wallet.Id}`);

  // 3. Register the webhook Hooks. The mandatory alert email is configured
  //    per integration in the Mangopay Dashboard — set it there.
  const notificationUrl = `${appBaseUrl}/api/webhooks/mangopay`;
  const existing = await api.Hooks.getAll();
  for (const eventType of HOOK_EVENT_TYPES) {
    const hook = existing.find((h) => h.EventType === eventType);
    if (hook) {
      await api.Hooks.update({ Id: hook.Id, Url: notificationUrl, Status: 'ENABLED' });
      console.log(`   ↻ hook ${eventType}`);
    } else {
      await api.Hooks.create({ EventType: eventType, Url: notificationUrl });
      console.log(`   + hook ${eventType}`);
    }
  }
  console.log(`✅  ${HOOK_EVENT_TYPES.length} hooks -> ${notificationUrl}`);

  console.log('\n─────────────────────────────────────────');
  console.log('Add these lines to your .env.local:\n');
  console.log(`MANGOPAY_PLATFORM_USER_ID=${user.Id}`);
  console.log(`MANGOPAY_CENTRAL_WALLET_ID=${wallet.Id}`);
  console.log('─────────────────────────────────────────');
  console.log('\nReminder: set the mandatory Hook alert email in the Mangopay Dashboard.');
}

main().catch((err) => {
  console.error('❌  Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
