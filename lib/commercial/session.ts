import type { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  COMMERCIAL_COOKIE,
  getCommercialSessionSecret,
  verifyCommercialCookieValue,
} from '@/lib/auth/commercial-session';

export type CommercialSession = {
  id: string;
  name: string;
  email: string | null;
  companyName: string;
  promoCode: string;
};

/**
 * Verifies the PIN session cookie for the given commercial `code` and returns
 * the resolved commercial. Returns null if the cookie is missing, malformed,
 * unsigned, or doesn't match the code in the URL — the contracts API routes
 * use this to authenticate every request before reading or writing.
 */
export async function getCommercialSession(
  req: NextRequest,
  code: string,
): Promise<CommercialSession | null> {
  const cookieValue = req.cookies.get(COMMERCIAL_COOKIE)?.value;
  if (!cookieValue) return null;

  let secret: string;
  try { secret = getCommercialSessionSecret(); } catch { return null; }

  const { valid, commercialId } = verifyCommercialCookieValue(cookieValue, code, secret);
  if (!valid || !commercialId) return null;

  const service = createServiceClient();
  const { data: com } = await service
    .from('commerciaux')
    .select('id, name, email, company_name, promo_codes(code)')
    .eq('id', commercialId)
    .eq('is_active', true)
    .maybeSingle();
  if (!com) return null;

  const promoCode = (com.promo_codes as { code: string } | null)?.code ?? code.toUpperCase();
  return {
    id: com.id,
    name: com.name,
    email: com.email,
    companyName: com.company_name,
    promoCode,
  };
}
