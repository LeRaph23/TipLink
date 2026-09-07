// Maps a raw Supabase auth error message to a friendly, localized string.
//
// Supabase returns terse English messages ("Token has expired or is invalid",
// "User already registered", "rate limit exceeded"). We pattern-match the
// known ones and, crucially, fall back to a generic localized message instead
// of echoing the raw error, so technical text never reaches users.
//
// `t` is a translator bound to the `auth` namespace (next-intl `useTranslations('auth')`).
type Translate = (key: string) => string;

export function mapAuthError(msg: string, t: Translate): string {
  const lower = (msg ?? '').toLowerCase();

  // A wrong or stale six-digit code. Supabase words this several ways
  // depending on whether the token was never valid, was already spent, or
  // aged out; they are one thing to the person typing it.
  if (
    lower.includes('token has expired') ||
    lower.includes('otp_expired') ||
    lower.includes('invalid token') ||
    lower.includes('token is invalid')
  ) {
    return t('errorInvalidCode');
  }
  // shouldCreateUser: false met an address with no account. Supabase reports
  // this as signups being disallowed, which is true of that call and useless
  // to the reader, so it becomes "no account here".
  if (
    lower.includes('signups not allowed') ||
    lower.includes('signup is disabled') ||
    lower.includes('user not found')
  ) {
    return t('errorNoAccount');
  }
  if (
    lower.includes('already registered') ||
    lower.includes('already in use') ||
    lower.includes('user already') ||
    lower.includes('email_address_invalid')
  ) {
    return t('errorEmailInUse');
  }
  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return t('errorTooManyRequests');
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return t('errorNetwork');
  }
  return t('errorGeneric');
}
