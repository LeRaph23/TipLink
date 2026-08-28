import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

/**
 * True for the onboarding wizard, whose URL carries `?code=<SmartTag id>`.
 *
 * That parameter is a sticker's short id, not a PKCE authorization code — but
 * supabase-js cannot tell, and treats any `?code=` as a callback the moment a
 * code verifier exists in storage. The wizard creates one when it calls
 * signUp() at the second-to-last step, so from that point every client it
 * builds tried to redeem "FNChjbBz" as an auth code, failed with
 * `flow_state_not_found`, and burned the verifier on the way out. The
 * confirmation email was then unredeemable: every link landed on
 * `?error=auth_callback_failed`.
 *
 * The wizard's parameter is now `tag`, but links with `code` are still honoured
 * for the ones already sent, so this guard has to stay.
 */
export function isOnboardingUrl(url: URL): boolean {
  return url.pathname.replace(/\/+$/, '').endsWith('/onboarding');
}

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Auth callbacks are handled server-side by /auth/callback, so the
        // browser never has to redeem anything from its own URL here.
        detectSessionInUrl: (url, params) => {
          if (isOnboardingUrl(url)) return false;
          return Boolean(params.access_token || params.error_description || params.code);
        },
      },
    }
  );
}
