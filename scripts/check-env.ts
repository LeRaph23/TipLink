#!/usr/bin/env npx tsx
/**
 * Validates that all required environment variables are set.
 * Run before deploying:
 *
 *   npx tsx scripts/check-env.ts
 */

const required: { key: string; hint: string }[] = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL',         hint: 'Supabase project URL' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',    hint: 'Supabase anon key' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY',        hint: 'Supabase service role key (server-only)' },
  { key: 'NEXT_PUBLIC_MANGOPAY_CLIENT_ID',   hint: 'Mangopay ClientId (also used by the browser SDK)' },
  { key: 'MANGOPAY_CLIENT_ID',               hint: 'Mangopay ClientId (Dashboard > API keys)' },
  { key: 'MANGOPAY_API_KEY',                 hint: 'Mangopay API key (Dashboard > API keys)' },
  { key: 'NEXT_PUBLIC_BASE_URL',             hint: 'e.g. https://digitip.app' },
  { key: 'MANGOPAY_PLATFORM_USER_ID',        hint: 'Run: npm run setup:mangopay' },
  { key: 'MANGOPAY_CENTRAL_WALLET_ID',       hint: 'Run: npm run setup:mangopay' },
  { key: 'MANGOPAY_WEBHOOK_ALLOWED_IPS',     hint: 'Mangopay Hook IPs (Dashboard > Webhooks)' },
];

const optional: { key: string; hint: string }[] = [
  { key: 'RESEND_API_KEY',            hint: 'Tip receipt emails (resend.com)' },
  { key: 'UPSTASH_REDIS_REST_URL',    hint: 'Production rate limiting (upstash.com)' },
  { key: 'UPSTASH_REDIS_REST_TOKEN',  hint: 'Production rate limiting (upstash.com)' },
];

let allOk = true;

console.log('Required environment variables:\n');
for (const { key, hint } of required) {
  const set = !!process.env[key];
  console.log(`  ${set ? '✅' : '❌'} ${key.padEnd(40)} ${set ? '' : `← ${hint}`}`);
  if (!set) allOk = false;
}

console.log('\nOptional environment variables:\n');
for (const { key, hint } of optional) {
  const set = !!process.env[key];
  console.log(`  ${set ? '✅' : '⚠️ '} ${key.padEnd(40)} ${set ? '' : `← ${hint}`}`);
}

console.log('');
if (!allOk) {
  console.error('❌  Some required variables are missing. Set them in .env.local and retry.\n');
  process.exit(1);
} else {
  console.log('✅  All required variables are set. Ready to deploy.\n');
}
