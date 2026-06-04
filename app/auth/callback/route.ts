import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { routing } from '@/i18n/routing';
import { createServiceClient } from '@/lib/supabase/service';
import type { EmailOtpType } from '@supabase/supabase-js';

const ALLOWED_NEXT_PREFIXES = ['/dashboard', '/pay', '/order', '/pricing', '/contact', '/onboarding', '/login', '/join', '/reset-password'];

function sanitizeNext(raw: string | null): string {
  if (!raw) return '/dashboard';
  // Reject absolute URLs and protocol-relative URLs.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/dashboard';
  }
  // Only allow whitelisted top-level or locale-prefixed paths.
  for (const prefix of ALLOWED_NEXT_PREFIXES) {
    if (raw === prefix || raw.startsWith(`${prefix}/`) || raw.startsWith(`${prefix}?`)) {
      return raw;
    }
    for (const loc of routing.locales) {
      const locPrefix: string = `/${loc}${prefix}`;
      if (raw === locPrefix || raw.startsWith(`${locPrefix}/`) || raw.startsWith(`${locPrefix}?`)) {
        return raw;
      }
    }
  }
  return '/dashboard';
}

function resolveLocale(request: NextRequest, cookieStore: Awaited<ReturnType<typeof cookies>>): string {
  const qp = new URL(request.url).searchParams.get('locale');
  if (qp && (routing.locales as readonly string[]).includes(qp)) return qp;
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
  if (cookieLocale && (routing.locales as readonly string[]).includes(cookieLocale)) return cookieLocale;
  return routing.defaultLocale;
}

function withLocale(target: string, locale: string): string {
  // If already locale-prefixed, keep as is.
  for (const loc of routing.locales) {
    if (target === `/${loc}` || target.startsWith(`/${loc}/`) || target.startsWith(`/${loc}?`)) {
      return target;
    }
  }
  if (target === '/') return `/${locale}`;
  return `/${locale}${target}`;
}

// True when the sanitized `next` points at the staff join/onboarding flow,
// either bare (`/join/…`) or locale-prefixed (`/fr/join/…`).
function isJoinNext(safeNext: string): boolean {
  if (safeNext === '/join' || safeNext.startsWith('/join/') || safeNext.startsWith('/join?')) {
    return true;
  }
  return routing.locales.some((loc) => {
    const p = `/${loc}/join`;
    return safeNext === p || safeNext.startsWith(`${p}/`) || safeNext.startsWith(`${p}?`);
  });
}

// Verification runs for both GET (PKCE `code` redirects from the same device)
// and POST (the emailed-invite interstitial — see /[locale]/auth/accept). Email
// security scanners pre-fetch links with a GET, which would consume a one-time
// invite/recovery token before the human ever clicks; routing those through a
// POST form means the token is only spent on a real user action.
async function handleCallback(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
  const cookieStore = await cookies();
  const locale = resolveLocale(request, cookieStore);

  const rawNext = requestUrl.searchParams.get('next');
  const safeNext = sanitizeNext(rawNext);
  const nextWithLocale = withLocale(safeNext, locale);

  // Use 303 so a POST entry (the invite interstitial) follows the redirect as a
  // GET. Harmless for GET entries, which would otherwise default to 307.
  const redirect = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);

  if (!code && !tokenHash) {
    return redirect(`/${locale}/login`);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  let authError: { message: string } | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authError = error;
  } else if (tokenHash && type) {
    // Email invite / magic-link flow: Supabase redirects with token_hash + type
    // instead of a PKCE code — verify the OTP directly.
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    authError = error;
  }

  if (authError) {
    // An expired or already-consumed invite token should not strand the
    // invitee on the login page — send them into the join/onboarding flow,
    // which lets them claim their profile and set a password unauthenticated.
    if (isJoinNext(safeNext)) {
      return redirect(nextWithLocale);
    }
    return redirect(`/${locale}/login?error=auth_callback_failed`);
  }

  // If no explicit `next` redirect, check whether this group_admin still needs onboarding
  if (!rawNext) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const service = createServiceClient();
      const { data: roleRow } = await service
        .from('user_roles')
        .select('group_id')
        .eq('user_id', user.id)
        .eq('role', 'group_admin')
        .not('group_id', 'is', null)
        .limit(1)
        .maybeSingle();

      if (roleRow?.group_id) {
        const { data: group } = await service
          .from('groups')
          .select('onboarding_completed_at')
          .eq('id', roleRow.group_id)
          .maybeSingle();

        if (group && !group.onboarding_completed_at) {
          return redirect(`/${locale}/onboarding`);
        }
      }
    }
  }

  return redirect(nextWithLocale);
}

export async function GET(request: NextRequest) {
  return handleCallback(request);
}

export async function POST(request: NextRequest) {
  return handleCallback(request);
}
