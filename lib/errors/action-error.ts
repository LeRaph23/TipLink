import 'server-only';
import { getTranslations } from 'next-intl/server';

// Stable, user-safe error categories returned by server actions. The raw
// Supabase/Zod/Stripe error is logged server-side and NEVER sent to the
// client — the client only ever receives a localized message for one of
// these codes (see the `errors` namespace in messages/*.json).
export type ActionErrorCode =
  | 'validation'
  | 'duplicate'
  | 'notFound'
  | 'forbidden'
  | 'unknown'
  | 'network'
  // A SmartTag that is already attached to another establishment. Distinct
  // from 'validation' because there is nothing about the manager's input to
  // fix: the tag genuinely belongs elsewhere, and "check your entry" sends
  // them looking for a typo that does not exist.
  | 'smartTagTaken';

// Maps a thrown/returned database error to a safe code. Postgres unique
// violations (23505) become 'duplicate'; everything else stays 'unknown'.
export function classifyDbError(err: unknown): ActionErrorCode {
  const code = (err as { code?: string } | null)?.code;
  if (code === '23505') return 'duplicate';
  return 'unknown';
}

// Builds the localized `{ error }` object a server action returns on failure.
// Logs the raw cause for observability; the returned string is already
// translated to the request locale, so callers can display it as-is.
export async function actionError(
  code: ActionErrorCode,
  rawCause?: unknown,
  context?: string,
): Promise<{ error: string }> {
  if (rawCause !== undefined) {
    console.error(`[action-error] ${context ?? code}`, rawCause);
  }
  const t = await getTranslations('errors');
  return { error: t(code) };
}
