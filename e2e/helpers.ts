import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';

// Local Supabase routes every auth email to Mailpit instead of sending it.
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324';

export const DEMO_EMAIL = 'demo@tiplink.dev';

type MailpitList = { messages: { ID: string; To: { Address: string }[]; Created: string }[] };

/** Waits for a code email to `email` newer than `since` and returns its 6-digit code. */
export async function readOtp(email: string, since: Date): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()) as MailpitList;
    const msg = list.messages.find(
      (m) => m.To.some((t) => t.Address === email) && new Date(m.Created) >= since
    );
    if (msg) {
      const body = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as { Text: string };
      const code = body.Text.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no code email for ${email}`);
}

/** Signs in through the real email-code form, reading the code from Mailpit. */
export async function login(page: Page, email = DEMO_EMAIL) {
  const since = new Date(Date.now() - 2000);
  await page.goto('/fr/login');
  await page.locator('#otp-email').fill(email);
  await page.getByRole('button', { name: 'Recevoir mon code' }).click();
  const code = await readOtp(email, since);
  await page.locator('#otp-code').fill(code);
  await page.getByRole('button', { name: 'Valider', exact: true }).click();
  // An account with no group yet is sent on to /onboarding.
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });
}

// Without real Stripe test keys (E2E_STRIPE_SECRET_KEY, see e2e/README.md) the
// embedded Stripe components cannot load; those failures are expected noise.
export const STRIPE_OFFLINE = !process.env.E2E_STRIPE_SECRET_KEY;
const STRIPE_NOISE = /Connect\.js|account-session|stripe/i;

/** Collects uncaught page errors so a test can assert the page rendered cleanly. */
export function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => {
    if (STRIPE_OFFLINE && STRIPE_NOISE.test(e.message)) return;
    errors.push(`${page.url()}: ${e.message}`);
  });
  return errors;
}

// --- Direct database access for test setup (local stack only) ---------------

function stackEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync('.e2e/env', 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

/** The ids written by the demo seed (see scripts/e2e/up.sh). */
export function seed(): { group_id: string; establishment_id: string } {
  return JSON.parse(readFileSync('.e2e/seed.json', 'utf8'));
}

/** Calls local Supabase with the service role (auth admin or PostgREST). */
export async function admin<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const env = stackEnv();
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Creates a confirmed auth user and returns its id. */
export async function createUser(email: string): Promise<string> {
  const user = await admin<{ id: string }>('/auth/v1/admin/users', {
    method: 'POST',
    body: { email, email_confirm: true },
  });
  return user.id;
}
