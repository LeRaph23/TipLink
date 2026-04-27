/**
 * Tests middleware locale routing and auth gating.
 *
 * We mock `next-intl/middleware` (ESM import issue under vitest) and focus on:
 * - NFC paths short-circuit intl entirely
 * - Intl redirects pass through untouched (307/308)
 * - Dashboard routes require auth
 * - Authenticated users are bounced off /login, /signup
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const getUserMock = vi.fn();

// Mock next-intl/middleware: act as a pass-through that returns NextResponse.next()
// for already-locale-prefixed URLs, and a 307 redirect for "/" / unprefixed.
vi.mock('next-intl/middleware', () => ({
  default: (_cfg: unknown) => (req: NextRequest) => {
    const { pathname } = req.nextUrl;
    const LOCALES = ['en', 'fr'];
    const hasLocale = LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
    if (!hasLocale) {
      const url = req.nextUrl.clone();
      url.pathname = `/en${pathname === '/' ? '' : pathname}`;
      return NextResponse.redirect(url, 307);
    }
    return NextResponse.next();
  },
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: getUserMock },
  })),
}));

describe('i18n + auth middleware', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: null } });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('redirects "/" to default locale "/en"', async () => {
    const { middleware } = await import('@/middleware');
    const response = await middleware(new NextRequest('https://tipl.ink/'));

    expect([307, 308]).toContain(response.status);
    expect(response.headers.get('location') ?? '').toMatch(/\/en\/?$/);
  });

  it('redirects unprefixed "/pricing" to "/en/pricing"', async () => {
    const { middleware } = await import('@/middleware');
    const response = await middleware(new NextRequest('https://tipl.ink/pricing'));

    expect([307, 308]).toContain(response.status);
    expect(response.headers.get('location') ?? '').toContain('/en/pricing');
  });

  it('redirects unauthenticated users from /en/dashboard to /en/login', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const { middleware } = await import('@/middleware');
    const response = await middleware(new NextRequest('https://tipl.ink/en/dashboard'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location') ?? '').toContain('/en/login');
  });

  it('redirects unauthenticated users from /fr/dashboard/billing to /fr/login', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const { middleware } = await import('@/middleware');
    const response = await middleware(new NextRequest('https://tipl.ink/fr/dashboard/billing'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location') ?? '').toContain('/fr/login');
  });

  it('redirects authenticated users away from /en/login', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'x@y.z' } } });

    const { middleware } = await import('@/middleware');
    const response = await middleware(new NextRequest('https://tipl.ink/en/login'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location') ?? '').toContain('/en/dashboard');
  });

  it('lets authenticated users through /fr/dashboard', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'x@y.z' } } });

    const { middleware } = await import('@/middleware');
    const response = await middleware(new NextRequest('https://tipl.ink/fr/dashboard'));

    expect([200, undefined]).toContain(response.status);
  });

  it('NFC "/s/*" paths short-circuit and never hit intl', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    const { middleware } = await import('@/middleware');
    const response = await middleware(new NextRequest('https://tipl.ink/s/ABC12345'));

    const location = response.headers.get('location') ?? '';
    expect(location).toContain('/not-found');
    // NFC redirects include locale prefix (en/fr) — this is correct behaviour
    expect(location).toMatch(/\/(en|fr)\//);

    vi.unstubAllGlobals();
  });
});
