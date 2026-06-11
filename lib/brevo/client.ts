// Minimal Brevo (ex-Sendinblue) REST client — used only for the commercial
// cold-email funnel so digitip.app's transactional reputation (Resend) stays
// isolated. Single endpoint: POST /smtp/email. Docs:
// https://developers.brevo.com/reference/sendtransacemail

import { serverEnv } from '@/lib/env';

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export type BrevoSendInput = {
  to: { email: string; name?: string }[];
  sender: { email: string; name?: string };
  subject: string;
  htmlContent: string;
  replyTo?: { email: string; name?: string };
  headers?: Record<string, string>;
  // List-Unsubscribe one-click is a Gmail/Outlook bulk-sender requirement
  // since Feb 2024. Brevo will populate List-Unsubscribe and the
  // List-Unsubscribe-Post header automatically when the value is set via
  // `headers['List-Unsubscribe']`.
};

export type BrevoSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; status?: number };

/** Sender used for all commercial cold emails. Must match the verified
 *  Brevo sender on the partenaires.digitip.app domain. */
export const BREVO_COMMERCIAL_SENDER = {
  email: 'raphael@partenaires.digitip.app',
  name: 'Raphaël Meyer · Digitip',
} as const;

export async function brevoSendTransactionalEmail(
  input: BrevoSendInput,
): Promise<BrevoSendResult> {
  const apiKey = serverEnv().BREVO_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'BREVO_API_KEY not configured' };
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
      // Bound the call so a hung Brevo connection can't stall a whole
      // cold-email cron batch up to the function's maxDuration.
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: body || res.statusText };
    }
    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, messageId: data.messageId ?? '' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
  }
}
