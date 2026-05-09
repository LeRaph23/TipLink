import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { routing } from '@/i18n/routing';
import { createServiceClient } from '@/lib/supabase/service';

const ALLOWED_NEXT_PREFIXES = ['/dashboard', '/pay', '/order', '/pricing', '/contact', '/onboarding', '/login', '/join'];

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

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const cookieStore = await cookies();
  const locale = resolveLocale(request, cookieStore);

  const rawNext = requestUrl.searchParams.get('next');
  const safeNext = sanitizeNext(rawNext);
  const nextWithLocale = withLocale(safeNext, locale);

  if (!code) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL(`/${locale}/login?error=auth_callback_failed`, request.url));
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
          return NextResponse.redirect(new URL(`/${locale}/onboarding`, request.url));
        }
      }
    }
  }

  return NextResponse.redirect(new URL(nextWithLocale, request.url));
}
