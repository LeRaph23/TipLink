import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Combined middleware: NFC redirect (no auth) + Supabase session refresh (auth routes)
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── NFC redirect: /s/[shortId] ──────────────────────────────────────────────
  // Runs before any routing. Uses raw PostgREST fetch (not SDK) for Edge compat.
  // The Supabase SDK pulls Node.js-incompatible paths; raw fetch is 100% Edge-safe.
  if (pathname.startsWith('/s/')) {
    const shortId = pathname.slice(3); // strip "/s/"

    if (!shortId || shortId.length < 4) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    let res: Response;
    try {
      res = await fetch(
        `${supabaseUrl}/rest/v1/nfc_stickers?short_id=eq.${encodeURIComponent(shortId)}&select=staff_id,establishment_id&limit=1`,
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
      return NextResponse.redirect(new URL('/not-found', request.url));
    }

    if (!res.ok) {
      return NextResponse.redirect(new URL('/not-found', request.url));
    }

    const rows: Array<{ staff_id: string | null; establishment_id: string | null }> =
      await res.json();

    if (!rows.length || (!rows[0].staff_id && !rows[0].establishment_id)) {
      return NextResponse.redirect(new URL('/not-found', request.url));
    }

    const { staff_id, establishment_id } = rows[0];
    const destination = staff_id
      ? `/pay/${staff_id}`
      : `/pay/group/${establishment_id}`;

    return NextResponse.redirect(new URL(destination, request.url), 302);
  }

  // ── Supabase session refresh for all other routes ───────────────────────────
  // Required so auth cookies are refreshed before SSR rendering.
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session (needed to keep tokens alive)
  const { data: { user } } = await supabase.auth.getUser();

  // Protect dashboard routes
  if (pathname.startsWith('/dashboard') && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect authenticated users away from auth pages
  if ((pathname === '/login' || pathname === '/signup') && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // NFC redirect paths
    '/s/:path*',
    // Auth-protected paths (excludes _next, static, public files)
    '/((?!_next/static|_next/image|favicon.ico|public|pay/).*)',
  ],
};
