import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// GET /api/onboarding/validate-code?code=XXXX
// Public endpoint — validates that a short_id exists and is unassigned.
// Rate-limited to prevent enumeration of unassigned NFC stickers.
// Min length matches middleware.ts NFC redirect (4 chars).
export async function GET(req: Request) {
  const ip = getClientIp(new Headers(req.headers));
  const rl = await rateLimit(`validate-code:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ valid: false }, { status: 429 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code')?.trim().toLowerCase();

  // Reject short, empty, or non-alphanumeric codes — same rules as middleware.ts.
  if (!code || code.length < 4 || !/^[a-z0-9_-]+$/.test(code)) {
    return NextResponse.json({ valid: false });
  }

  // A tag is "available for onboarding" when it exists and is not yet linked
  // to an establishment. `staff_id` was dropped in migration 00014 — a tag is
  // now scoped to an establishment only — so establishment_id IS NULL is the
  // sole stock/unassigned check.
  const service = createServiceClient();
  const { data } = await service
    .from('nfc_stickers')
    .select('id')
    .eq('short_id', code)
    .is('establishment_id', null)
    .maybeSingle();

  return NextResponse.json({ valid: !!data });
}
