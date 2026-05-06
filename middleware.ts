import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

// Combined middleware: NFC redirect (no auth, no locale) + next-intl (locale routing)
// + Supabase session refresh (for auth-protected pages).
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1) NFC redirect: /s/[shortId] — short-circuits everything else.
  //    Uses raw PostgREST fetch (Edge-safe, no Supabase SDK).
  if (pathname.startsWith('/s/')) {
    const shortId = pathname.slice(3).toLowerCase();

    const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
    const acceptLang = request.headers.get('accept-language') ?? '';
    const preferredLocale =
      (cookieLocale && (routing.locales as readonly string[]).includes(cookieLocale) && cookieLocale) ||
      (acceptLang.toLowerCase().startsWith('fr') ? 'fr' : routing.defaultLocale);

    if (!shortId || shortId.length < 4) {
      return NextResponse.redirect(new URL(`/${preferredLocale}`, request.url));
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    let res: Response;
    try {
      res = await fetch(
        `${supabaseUrl}/rest/v1/nfc_stickers?short_id=eq.${encodeURIComponent(shortId)}&select=establishment_id&limit=1`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Accept: 'application/json',
          },
          cache: 'no-store',
        }
      );
    } catch {
      return NextResponse.redirect(new URL(`/${preferredLocale}/not-found`, request.url));
    }

    if (!res.ok) {
      return NextResponse.redirect(new URL(`/${preferredLocale}/not-found`, request.url));
    }

    const rows: Array<{ establishment_id: string | null }> = await res.json();

    if (!rows.length) {
      return NextResponse.redirect(new URL(`/${preferredLocale}/not-found`, request.url));
    }

    if (!rows[0].establishment_id) {
      // Tag exists but is not yet assigned to a salon — launch onboarding wizard
      const destination = `/${preferredLocale}/onboarding?code=${encodeURIComponent(shortId)}`;
      return NextResponse.redirect(new URL(destination, request.url), 302);
    }

    const destination = `/${preferredLocale}/pay/group/${rows[0].establishment_id}`;
    return NextResponse.redirect(new URL(destination, request.url), 302);
  }

  // 2) next-intl middleware: handles locale prefix detection/redirect.
  //    This produces the response we'll augment with Supabase cookie handling.
  const intlResponse = intlMiddleware(request);

  // If intl redirected (e.g. `/` → `/en`), return immediately.
  if (intlResponse.status === 307 || intlResponse.status === 308) {
    return intlResponse;
  }

  // 3) Supabase session refresh: only for locale-prefixed routes.
  //    We create a response that carries intl headers and attaches Supabase cookies.
  let response = intlResponse;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Re-run intl middleware to produce a fresh response carrying its headers,
          // then copy the new Supabase cookies onto it.
          response = intlMiddleware(request);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Strip locale prefix for route-matching logic
  const localePrefix = routing.locales.find(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
  );
  const bare = localePrefix ? pathname.slice(`/${localePrefix}`.length) || '/' : pathname;

  // Protect dashboard routes
  if (bare.startsWith('/dashboard') && !user) {
    const loginUrl = new URL(`/${localePrefix ?? routing.defaultLocale}/login`, request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages
  if ((bare === '/login' || bare === '/signup') && user) {
    const dashUrl = new URL(`/${localePrefix ?? routing.defaultLocale}/dashboard`, request.url);
    return NextResponse.redirect(dashUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // NFC redirect
    '/s/:path*',
    // All pages except: api, auth (Supabase callback), static assets.
    // next-intl matches /, /en, /fr, /en/*, /fr/*, /something (and redirects to default).
    '/((?!_next/static|_next/image|favicon.ico|public|api/|auth/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|avif)$).*)',
  ],
};
