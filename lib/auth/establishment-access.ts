import 'server-only';
import { getManageScope, canManageGroup } from '@/lib/auth/ownership';
import { verifyOnboardingToken } from '@/lib/auth/onboarding-token';
import type { createServiceClient } from '@/lib/supabase/service';

type Service = ReturnType<typeof createServiceClient>;

export type EstablishmentAccess =
  | { ok: true; establishmentId: string; groupId: string }
  | { ok: false; status: 404 | 403 };

/**
 * Authorizes a caller for one establishment's Connect account.
 *
 * The onboarding wizard needs this before the manager has a session — in scan
 * and express modes the account is created and then signed out pending email
 * confirmation — so a signed onboarding token is accepted as an alternative to
 * an authenticated group admin. Both are bound to the establishment's group, so
 * neither can reach another tenant.
 *
 * Callers use the service client, which bypasses RLS: this check is the only
 * thing between a guessed UUID and someone else's payout account.
 */
export async function authorizeEstablishmentAccess(
  supabase: Service,
  establishmentId: string,
  token?: string | null,
): Promise<EstablishmentAccess> {
  const { data: estab } = await supabase
    .from('establishments')
    .select('id, group_id')
    .eq('id', establishmentId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!estab) return { ok: false, status: 404 };

  if (token && verifyOnboardingToken(token, estab.group_id).valid) {
    return { ok: true, establishmentId: estab.id, groupId: estab.group_id };
  }

  const scope = await getManageScope();
  if (scope && canManageGroup(scope, estab.group_id)) {
    return { ok: true, establishmentId: estab.id, groupId: estab.group_id };
  }

  return { ok: false, status: 403 };
}
