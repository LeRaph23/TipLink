#!/usr/bin/env npx tsx
/**
 * Validates that all required environment variables are set.
 * Run before deploying:
 *
 *   npx tsx scripts/check-env.ts
 *
 * The required lists come from lib/env-requirements.ts, which is the same
 * source lib/env.ts is pinned against by
 * __tests__/lib/env-required-parity.test.ts. Do not re-type the keys here:
 * this script once listed three variables fewer than `serverEnv()` actually
 * demands, so it printed "Ready to deploy" for a configuration that throws in
 * production on the first server action that reads one of them.
 *
 * Length is checked, not just presence, because lib/env.ts enforces a minimum
 * on every one of these and a too-short value fails exactly the same way an
 * absent one does.
 */

import {
  REQUIRED_PUBLIC_VARS,
  REQUIRED_SERVER_VARS,
  type RequiredServerVar,
} from '../lib/env-requirements';

const optional: { key: string; hint: string }[] = [
  { key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', hint: 'Stripe publishable key (pk_...) — checkout is dead without it' },
  { key: 'RESEND_API_KEY',            hint: 'Tip receipt emails (resend.com)' },
  { key: 'GOOGLE_PLACES_API_KEY',     hint: 'Google review link picker + salon enrichment' },
  { key: 'UPSTASH_REDIS_REST_URL',    hint: 'Production rate limiting (upstash.com)' },
  { key: 'UPSTASH_REDIS_REST_TOKEN',  hint: 'Production rate limiting (upstash.com)' },
  // Without these the dashboard shows no price and /api/billing/subscribe
  // answers 503 pro_unavailable. Everything else keeps working on the free
  // plan, which is why they are optional rather than required.
  { key: 'STRIPE_PRICE_PRO_MONTHLY',  hint: 'Digitip Pro monthly price. Run: npm run setup:stripe' },
  { key: 'STRIPE_PRICE_PRO_YEARLY',   hint: 'Digitip Pro yearly price. Run: npm run setup:stripe' },
  { key: 'STRIPE_WEBHOOK_SECRET_CONNECT', hint: 'Second Stripe webhook (connected accounts): account.updated, payout.*' },
  { key: 'AMBASSADOR_SESSION_SECRET', hint: 'Ambassador portal sessions (32+ chars). Portal returns 500 without it' },
  { key: 'COMMERCIAL_SESSION_SECRET', hint: 'Commercial portal sessions. Falls back to AMBASSADOR_SESSION_SECRET' },
  { key: 'LIFECYCLE_EMAIL_UNSUB_SECRET', hint: 'One-click unsubscribe links in lifecycle emails (16+ chars)' },
  { key: 'BREVO_API_KEY',             hint: 'Commercial cold-email funnel' },
];

let allOk = true;

function report(label: string, vars: readonly RequiredServerVar[]) {
  console.log(`${label}\n`);
  for (const { key, minLength, hint } of vars) {
    const value = process.env[key];
    const trimmed = value?.trim() ?? '';
    let problem: string | null = null;
    if (!value) problem = `← ${hint}`;
    else if (trimmed.length < minLength) {
      // lib/env.ts rejects these identically to an absent value, so flagging
      // them as "set" would be the same lie this script was fixed to stop
      // telling.
      problem = `← too short (${trimmed.length}/${minLength} chars) — ${hint}`;
    }
    console.log(`  ${problem ? '❌' : '✅'} ${key.padEnd(40)} ${problem ?? ''}`);
    if (problem) allOk = false;
  }
}

report('Required public variables:', REQUIRED_PUBLIC_VARS);
console.log('');
report('Required server variables:', REQUIRED_SERVER_VARS);

console.log('\nOptional environment variables:\n');
for (const { key, hint } of optional) {
  const set = !!process.env[key];
  console.log(`  ${set ? '✅' : '⚠️ '} ${key.padEnd(40)} ${set ? '' : `← ${hint}`}`);
}

// CRON_SECRET and COLD_EMAIL_UNSUB_SECRET must differ so that leaking one does
// not let an attacker forge the other — see the comment in lib/env.ts.
if (
  process.env.CRON_SECRET &&
  process.env.CRON_SECRET === process.env.COLD_EMAIL_UNSUB_SECRET
) {
  console.log('\n❌  CRON_SECRET and COLD_EMAIL_UNSUB_SECRET are identical — give them distinct values.');
  allOk = false;
}

console.log('');
if (!allOk) {
  console.error('❌  Some required variables are missing or invalid. Set them in .env.local and retry.\n');
  process.exit(1);
} else {
  console.log('✅  All required variables are set. Ready to deploy.\n');
}
