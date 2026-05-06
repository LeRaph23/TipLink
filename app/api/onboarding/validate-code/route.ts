import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

// GET /api/onboarding/validate-code?code=XXXX
// Public endpoint — validates that a short_id exists and is unassigned.
// Uses service client to bypass RLS (anon key can't read nfc_stickers).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code')?.trim().toLowerCase();

  if (!code || code.length < 1) {
    return NextResponse.json({ valid: false });
  }

  const service = createServiceClient();
  const { data } = await service
    .from('nfc_stickers')
    .select('id')
    .eq('short_id', code)
    .is('establishment_id', null)
    .maybeSingle();

  return NextResponse.json({ valid: !!data });
}
