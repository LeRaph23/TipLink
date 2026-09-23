#!/usr/bin/env npx tsx
/**
 * Makes one establishment of the LOCAL e2e stack able to take real test-mode
 * tips, without going through Stripe's embedded onboarding.
 *
 * Why this exists: production accounts use `requirement_collection: 'stripe'`,
 * so identity checks happen in Stripe's own window (a popup an automated
 * browser cannot drive), and the platform cannot fill them through the API.
 * This script instead creates a TEST account whose requirements the platform
 * collects (`requirement_collection: 'application'`), fills them with Stripe's
 * test values, waits until charges and payouts are enabled, and links it to
 * the establishment. Everything after that — the tip page, the payment, the
 * transfer to the establishment, the dashboards — runs the app's real code.
 * What it does NOT exercise is the embedded onboarding form itself.
 *
 * Usage (after `npm run e2e:up` with Stripe keys in .env.e2e):
 *   npm run e2e:payable                   # the demo establishment
 *   npm run e2e:payable -- "Café Test"    # by name (substring) or id
 */
import Stripe from 'stripe';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';

function readEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync('.e2e/env', 'utf8');
  } catch {
    fail('No .e2e/env: start the local stack first with `npm run e2e:up`.');
  }
  for (const line of raw.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

function fail(message: string): never {
  console.error(`❌  ${message}`);
  process.exit(1);
}

const env = readEnv();
const key = env.STRIPE_SECRET_KEY ?? '';
if (!/^(sk|rk)_test_/.test(key) || key.includes('e2e_dummy')) {
  fail('Stripe is not in TEST mode on the local stack: put your sk_test_ keys in .env.e2e, then `npm run e2e:up`.');
}
const stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia' });
const publishableKey = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
if (!/^pk_test_/.test(publishableKey) || publishableKey.includes('e2e_dummy')) {
  fail('E2E_STRIPE_PUBLISHABLE_KEY (pk_test_...) is missing from .env.e2e: account tokens need it.');
}
const publishable = new Stripe(publishableKey, { apiVersion: '2026-03-25.dahlia' });

const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = env.NEXT_PUBLIC_BASE_URL;

async function db<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${SUPABASE}/rest/v1${path}`, {
    method: init.method ?? 'GET',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) fail(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

type Establishment = {
  id: string;
  name: string;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
};

async function findEstablishment(arg: string | undefined): Promise<Establishment> {
  const cols = 'id,name,stripe_account_id,stripe_charges_enabled,stripe_payouts_enabled';
  if (!arg) {
    const { establishment_id } = JSON.parse(readFileSync('.e2e/seed.json', 'utf8'));
    arg = establishment_id as string;
  }
  const byId = /^[0-9a-f-]{36}$/i.test(arg);
  const rows = await db<Establishment[]>(
    byId
      ? `/establishments?id=eq.${arg}&deleted_at=is.null&select=${cols}`
      : `/establishments?name=ilike.*${encodeURIComponent(arg)}*&deleted_at=is.null&select=${cols}`
  );
  if (rows.length === 1) return rows[0];
  const all = await db<{ name: string; id: string }[]>('/establishments?deleted_at=is.null&select=id,name&order=created_at');
  console.error(rows.length ? `Several establishments match "${arg}":` : `No establishment matches "${arg}". Existing ones:`);
  for (const e of rows.length ? rows : all) console.error(`  - ${e.name}  (${e.id})`);
  process.exit(1);
}

// Stripe's documented test values: they pass verification instantly in test
// mode and are rejected in live mode.
//
// A platform based in France may not send legal-entity details or the terms
// acceptance on accounts.create when it collects requirements itself: they
// must arrive as an account token, which Stripe only issues against the
// PUBLISHABLE key (normally from Stripe.js in the browser).
async function createVerifiedTestAccount(estab: Establishment): Promise<string> {
  const email = `e2e+${estab.id.slice(0, 8)}@exemple.fr`;
  const token = await publishable.tokens.create({
    account: {
      business_type: 'individual',
      individual: {
        first_name: 'Jenny',
        last_name: 'Rosen',
        email,
        phone: '+33612345678',
        dob: { day: 1, month: 1, year: 1901 },
        address: { line1: 'address_full_match', city: 'Paris', postal_code: '75001', country: 'FR' },
        verification: { document: { front: 'file_identity_document_success' } },
      },
      tos_shown_and_accepted: true,
    },
  });

  const account = await stripe.accounts.create({
    country: 'FR',
    email,
    account_token: token.id,
    controller: {
      stripe_dashboard: { type: 'none' },
      requirement_collection: 'application',
      losses: { payments: 'application' },
      fees: { payer: 'application' },
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: {
      mcc: '5812',
      name: estab.name,
      url: 'https://accessible.stripe.com',
      product_description: 'Pourboires (compte de test e2e)',
    },
    external_account: {
      object: 'bank_account',
      country: 'FR',
      currency: 'eur',
      account_number: 'FR1420041010050500013M02606',
    },
    settings: { payouts: { schedule: { interval: 'weekly', weekly_anchor: 'monday' } } },
    metadata: { establishment_id: estab.id, e2e: 'true' },
  });
  return account.id;
}

async function waitUntilEnabled(accountId: string): Promise<Stripe.Account> {
  let account = await stripe.accounts.retrieve(accountId);
  for (let i = 0; i < 30 && !(account.charges_enabled && account.payouts_enabled); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    account = await stripe.accounts.retrieve(accountId);
  }
  return account;
}

async function ensureTag(estabId: string): Promise<string> {
  const tags = await db<{ short_id: string }[]>(`/nfc_stickers?establishment_id=eq.${estabId}&select=short_id&limit=1`);
  if (tags.length) return tags[0].short_id;
  const shortId = randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8).toLowerCase();
  await db('/nfc_stickers', { method: 'POST', body: { short_id: shortId, establishment_id: estabId } });
  return shortId;
}

async function main() {
  const estab = await findEstablishment(process.argv[2]);
  console.log(`Établissement : ${estab.name} (${estab.id})`);

  let accountId = estab.stripe_account_id;
  const existing = accountId ? await stripe.accounts.retrieve(accountId).catch(() => null) : null;
  const reusable =
    existing?.metadata?.e2e === 'true' && existing.charges_enabled && existing.payouts_enabled;

  if (!reusable) {
    if (accountId) console.log(`Remplace le compte ${accountId} (onboarding non terminé) par un compte de test vérifié.`);
    accountId = await createVerifiedTestAccount(estab);
    console.log(`Compte Stripe de test créé : ${accountId}`);
    // Link it before it is enabled: the account.updated webhook that follows
    // activation (forwarded by `stripe listen`) then finds the establishment,
    // syncs the flags and invalidates the cached tip pages, as in production.
    await db(`/establishments?id=eq.${estab.id}`, {
      method: 'PATCH',
      body: { stripe_account_id: accountId, stripe_charges_enabled: false, stripe_payouts_enabled: false },
    });
  } else {
    console.log(`Compte Stripe de test déjà vérifié : ${accountId}`);
  }

  const account = await waitUntilEnabled(accountId!);
  if (!(account.charges_enabled && account.payouts_enabled)) {
    console.error('Stripe n\'a pas activé le compte. Exigences restantes :');
    console.error(JSON.stringify(
      { currently_due: account.requirements?.currently_due, errors: account.requirements?.errors, disabled_reason: account.requirements?.disabled_reason },
      null, 2,
    ));
    fail('Colle ce message à Claude.');
  }

  // Same flags the webhook writes, in case `stripe listen` is not running.
  await db(`/establishments?id=eq.${estab.id}`, {
    method: 'PATCH',
    body: {
      stripe_account_id: accountId,
      stripe_details_submitted: true,
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
    },
  });

  const staff = await db<{ full_name: string }[]>(
    `/staff_profiles?establishment_id=eq.${estab.id}&is_active=eq.true&deleted_at=is.null&select=full_name`
  );
  const shortId = await ensureTag(estab.id);

  console.log('\n✅  Prêt à encaisser des pourboires (mode test).');
  console.log(`   Scan du tag :      ${BASE_URL}/s/${shortId}`);
  console.log(`   Page de l'équipe : ${BASE_URL}/fr/pay/group/${estab.id}`);
  console.log(`   Employés actifs :  ${staff.length ? staff.map((s) => s.full_name).join(', ') : 'aucun — ajoutez-en un depuis le dashboard'}`);
  console.log('   Carte de test :    4242 4242 4242 4242, date future, CVC quelconque');
  console.log('   Si la page affiche encore « pas encore actif », elle est en cache : réessayez dans 5 minutes.');
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
