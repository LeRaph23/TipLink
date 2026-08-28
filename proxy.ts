import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

// Combined proxy: NFC redirect (no auth, no locale) + next-intl (locale routing)
// + Supabase session refresh (for auth-protected pages).
export async function proxy(request: NextRequest) {
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

    // Reject short, empty, or non-alphanumeric shortIds before hitting PostgREST.
    // Without this, ILIKE wildcards (e.g. "%%%%") would match any NFC sticker.
    if (!shortId || shortId.length < 4 || !/^[a-z0-9_-]+$/.test(shortId)) {
      return NextResponse.redirect(new URL(`/${preferredLocale}/not-found`, request.url));
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Resolve via an RPC backed by a functional lower(short_id) index, so the
    // lookup is an index scan rather than a sequential scan. The RPC returns the
    // same shape as before: [] when unknown, [{ establishment_id }] otherwise
    // (establishment_id null = unassigned stock tag).
    let res: Response;
    try {
      res = await fetch(`${supabaseUrl}/rest/v1/rpc/resolve_sticker_establishment`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ p_short_id: shortId }),
        cache: 'no-store',
      });
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
      // Tag exists but is not yet assigned to a salon — launch onboarding wizard.
      // `tag`, not `code`: supabase-js claims any `?code=` as a PKCE
      // authorization code once a verifier is in storage, which the wizard
      // creates when it signs the manager up. See lib/supabase/client.ts.
      const destination = `/${preferredLocale}/onboarding?tag=${encodeURIComponent(shortId)}`;
      return NextResponse.redirect(new URL(destination, request.url), 302);
    }

    // Render the colleague list in-place via an internal rewrite instead of a
    // 302. A redirect forces the browser into a second round-trip — a blank
    // screen while /s/[code] bounces to /pay/group/[id] — which is the lag felt
    // right after a scan. A rewrite serves the (streamed) group page on this
    // same request, so the branded hero paints immediately. The visible URL
    // stays /s/[code], and the rewrite does not re-run this middleware.
    const destination = `/${preferredLocale}/pay/group/${rows[0].establishment_id}`;
    return NextResponse.rewrite(new URL(destination, request.url));
  }

  // 2) next-intl middleware: handles locale prefix detection/redirect.
  //    This produces the response we'll augment with Supabase cookie handling.
  const intlResponse = intlMiddleware(request);

  // If intl redirected (e.g. `/` → `/en`), return immediately.
  if (intlResponse.status === 307 || intlResponse.status === 308) {
    return intlResponse;
  }

  // 3) Supabase session refresh — only where auth actually matters.
  //    Strip the locale prefix first so we can decide cheaply whether this
  //    request needs a Supabase round-trip at all.
  const localePrefix = routing.locales.find(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
  );
  const bare = localePrefix ? pathname.slice(`/${localePrefix}`.length) || '/' : pathname;

  // Public pages (landing, /pay, legal, …) don't gate on auth and don't need
  // their session refreshed on every paint. Skipping getUser() here removes an
  // Auth network round-trip from the critical tipping/landing path; the session
  // is still refreshed the moment the visitor hits a protected/auth route below.
  const needsAuth =
    bare.startsWith('/dashboard') || bare === '/login' || bare === '/signup';
  if (!needsAuth) {
    return intlResponse;
  }

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
    '/((?!_next/static|_next/image|favicon.ico|public|api/|auth/|sitemap.xml|robots.txt|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|avif)$).*)',
  ],
};
