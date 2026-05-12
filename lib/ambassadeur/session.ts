import type { NextRequest } from 'next/server';
import { verifyCookieValue } from '@/app/api/ambassadeur/[code]/auth/route';
import { createServiceClient } from '@/lib/supabase/service';

export type AmbassadorSession = {
  id: string;
  name: string;
  email: string | null;
  promoCode: string;
};

/**
 * Verifies the PIN session cookie for the given ambassador `code` and returns
 * the resolved ambassador. Returns null if the cookie is missing, malformed,
 * unsigned, or doesn't match the code in the URL.
 */
export async function getAmbassadorSession(
  req: NextRequest,
  code: string,
): Promise<AmbassadorSession | null> {
  const cookieValue = req.cookies.get('amb_session')?.value;
  if (!cookieValue) return null;

  const secret = process.env.AMBASSADOR_SESSION_SECRET;
  if (!secret) return null;

  const { valid, ambassadorId } = verifyCookieValue(cookieValue, code, secret);
  if (!valid || !ambassadorId) return null;

  const service = createServiceClient();
  const { data: amb } = await service
    .from('ambassadors')
    .select('id, name, email, promo_codes(code)')
    .eq('id', ambassadorId)
    .eq('is_active', true)
    .maybeSingle();

  if (!amb) return null;
  const promoCode = (amb.promo_codes as { code: string } | null)?.code ?? code.toUpperCase();
  return {
    id: amb.id,
    name: amb.name,
    email: amb.email,
    promoCode,
  };
}
