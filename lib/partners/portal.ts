import { createServiceClient } from '@/lib/supabase/service';

/**
 * Whether `code` opens an active ambassador or sales-rep portal. Checked on
 * the server so an unknown code is a plain 404 instead of a PIN screen for a
 * portal that does not exist (seventh QA run). The code is the partner's own
 * promo code, already public on every flyer, so this reveals nothing new.
 */
export async function partnerPortalExists(
  kind: 'ambassador' | 'commercial',
  code: string,
): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,40}$/.test(normalized)) return false;
  const service = createServiceClient();
  const { data: promo } = await service
    .from('promo_codes')
    .select('id')
    .eq('code', normalized)
    .maybeSingle();
  if (!promo) return false;
  const table = kind === 'ambassador' ? 'ambassadors' : 'commerciaux';
  const { data: partner } = await service
    .from(table)
    .select('id')
    .eq('promo_code_id', promo.id)
    .eq('is_active', true)
    .maybeSingle();
  return Boolean(partner);
}
