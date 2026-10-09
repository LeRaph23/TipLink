import type { createServiceClient } from '@/lib/supabase/service';

export type BuyerGroup = {
  id: string;
  legalName: string | null;
  stripeCustomerId: string | null;
  shipping: {
    name: string | null;
    line1: string;
    line2: string | null;
    city: string;
    postal_code: string;
    country: string;
  } | null;
};

/**
 * The business a signed-in buyer orders for: the group they own. A new order
 * from them joins it (webhook handlePackOrderPaid) instead of creating a
 * second, empty business the way a signed-out order does.
 *
 * Null for anyone who owns no group (a team member, a super admin, an
 * account that never ordered): they order like a visitor.
 */
export async function findBuyerGroup(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<BuyerGroup | null> {
  const { data: role } = await service
    .from('user_roles')
    .select('group_id')
    .eq('user_id', userId)
    .eq('role', 'group_admin')
    .not('group_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!role?.group_id) return null;

  const { data: group } = await service
    .from('groups')
    .select('id, legal_name, name, stripe_customer_id, shipping_address')
    .eq('id', role.group_id)
    .maybeSingle();
  if (!group) return null;

  return {
    id: group.id,
    legalName: group.legal_name ?? group.name ?? null,
    stripeCustomerId: group.stripe_customer_id,
    shipping: parseAddress(group.shipping_address),
  };
}

function parseAddress(raw: unknown): BuyerGroup['shipping'] {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const line1 = str(a.line1);
  const city = str(a.city);
  const country = str(a.country).toUpperCase();
  if (!line1 || !city || country.length !== 2) return null;
  return {
    name: str(a.name) || null,
    line1,
    line2: str(a.line2) || null,
    city,
    postal_code: str(a.postal_code),
    country,
  };
}
