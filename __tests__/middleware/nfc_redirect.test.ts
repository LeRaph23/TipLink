/**
 * Tests NFC redirect middleware logic.
 * Uses mocked fetch to simulate PostgREST responses.
 *
 * Run: npm test -- __tests__/middleware/nfc_redirect.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockFetch = vi.fn();

describe('NFC Redirect Middleware', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
    // Reset module cache so middleware picks up fresh env vars
    vi.resetModules();
  });

  it('redirects to /pay/[staffId] when sticker has staff_id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ staff_id: 'staff-uuid-123', establishment_id: null }],
    });

    const { middleware } = await import('@/middleware');
    const request = new NextRequest('https://tipl.ink/s/ABC12345');
    const response = await middleware(request);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://tipl.ink/pay/staff-uuid-123');
  });

  it('redirects to /pay/group/[estId] when sticker has only establishment_id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ staff_id: null, establishment_id: 'est-uuid-456' }],
    });

    const { middleware } = await import('@/middleware');
    const request = new NextRequest('https://tipl.ink/s/XYZ98765');
    const response = await middleware(request);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://tipl.ink/pay/group/est-uuid-456');
  });

  it('redirects to /not-found for unknown short_id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const { middleware } = await import('@/middleware');
    const request = new NextRequest('https://tipl.ink/s/UNKNOWN1');
    const response = await middleware(request);

    expect(response.headers.get('location')).toContain('/not-found');
  });

  it('redirects to /not-found when PostgREST returns error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Unauthorized' }),
    });

    const { middleware } = await import('@/middleware');
    const request = new NextRequest('https://tipl.ink/s/ABC12345');
    const response = await middleware(request);

    expect(response.headers.get('location')).toContain('/not-found');
  });

  it('uses service role key in Authorization header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ staff_id: 'staff-uuid-123', establishment_id: null }],
    });

    const { middleware } = await import('@/middleware');
    await middleware(new NextRequest('https://tipl.ink/s/ABC12345'));

    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[1].headers['Authorization']).toContain('Bearer test-service-role-key');
  });

  it('passes short_id as URL-encoded query parameter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ staff_id: 'staff-uuid-123', establishment_id: null }],
    });

    const { middleware } = await import('@/middleware');
    await middleware(new NextRequest('https://tipl.ink/s/AB+CD'));

    const fetchUrl = mockFetch.mock.calls[0][0] as string;
    expect(fetchUrl).toContain('AB%2BCD');
  });
});
