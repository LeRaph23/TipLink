import { createClient } from '@/lib/supabase/client';

/**
 * Floor between two code requests for the same address, in milliseconds.
 *
 * Supabase enforces its own per-address minimum server-side; asking again
 * sooner earns a rate-limit error rather than a second email, so every
 * "resend" control has to be held shut for at least this long. Exported so the
 * countdown a user sees and the limit that actually applies are one number.
 */
export const RESEND_COOLDOWN_MS = 60_000;

export type OtpResult = { ok: true } | { ok: false; message: string };

/**
 * Emails a six-digit code to `email`.
 *
 * Whether a code or a link arrives is decided by the Supabase email templates,
 * not by this call: `{{ .Token }}` in the template means a code, and it has to
 * be present in BOTH the Magic Link template (existing account) and the Confirm
 * signup template (new account), because which one fires depends on
 * `shouldCreateUser` and on whether the address is already known.
 *
 * `fullName` rides along as user metadata so a brand new account already has a
 * name by the time the code is verified. It is ignored for an existing user.
 */
export async function requestEmailCode(
  email: string,
  {
    shouldCreateUser,
    fullName,
  }: {
    /**
     * False on the login form: silently creating an account there would land
     * someone on an empty dashboard with no role and no way to explain it.
     */
    shouldCreateUser: boolean;
    fullName?: string;
  },
): Promise<OtpResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser,
      ...(fullName?.trim() ? { data: { full_name: fullName.trim() } } : {}),
    },
  });
  return error ? { ok: false, message: error.message } : { ok: true };
}

/**
 * Exchanges a six-digit code for a session.
 *
 * `type: 'email'` covers both templates: Supabase issues one token per address
 * regardless of which email carried it, so a code from Confirm signup and a
 * code from Magic Link verify identically. On success the session is persisted
 * by the browser client, so callers only need to know it worked.
 */
export async function verifyEmailCode(email: string, token: string): Promise<OtpResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'email',
  });
  return error ? { ok: false, message: error.message } : { ok: true };
}
