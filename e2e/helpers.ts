import { expect, type Page } from '@playwright/test';

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
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
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
