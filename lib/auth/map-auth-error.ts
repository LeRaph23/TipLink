// Maps a raw Supabase auth error message to a friendly, localized string.
//
// Supabase returns terse English messages ("Invalid login credentials",
// "User already registered", "rate limit exceeded"). We pattern-match the
// known ones and — crucially — fall back to a generic localized message
// instead of echoing the raw error, so technical text never reaches users.
//
// `t` is a translator bound to the `auth` namespace (next-intl `useTranslations('auth')`).
type Translate = (key: string) => string;

export function mapAuthError(msg: string, t: Translate): string {
  const lower = (msg ?? '').toLowerCase();

  if (
    lower.includes('invalid login') ||
    lower.includes('invalid credentials') ||
    lower.includes('email not confirmed')
  ) {
    return t('errorInvalidCredentials');
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
