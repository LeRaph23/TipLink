// What Pro unlocks, for reference: the post-tip Google review invitation
// (enforced in SQL, see migration 00076) and the payroll export beyond the
// current month, with its monthly delivery to the accountant.
//
// The rule behind that split: nothing which increases tip volume is ever gated,
// because tips are the platform's own revenue and charging for them would be
// paying to earn less. So Pro is administrative and reputational only, and the
// free plan keeps unlimited tips, unlimited staff, full history and full
// analytics.
//
// This used to be a `PRO_FEATURES` object nothing imported. Each gate reads the
// plan where it stands, which is the only place the answer can be enforced, so
// the map was a second description of the rules that no code had to agree with.

import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

export type Plan = 'free' | 'pro';

type Service = ReturnType<typeof createServiceClient>;

/**
 * The group's current plan.
 *
 * Reads the column the Stripe webhooks maintain rather than asking Stripe:
 * entitlement checks sit on request paths that must not depend on a third
 * party being reachable. `customer.subscription.*` keeps it honest, and a
 * subscription that lapses is downgraded there.
 */
export async function getPlan(service: Service, groupId: string): Promise<Plan> {
  const { data } = await service
    .from('groups')
    .select('plan')
    .eq('id', groupId)
    .is('deleted_at', null)
    .maybeSingle();

  return data?.plan === 'pro' ? 'pro' : 'free';
}

export async function hasPro(service: Service, groupId: string): Promise<boolean> {
  return (await getPlan(service, groupId)) === 'pro';
}

/**
 * Maps a Stripe subscription status to a plan.
 *
 * `trialing` and `past_due` keep the features on: a trial is the whole point,
 * and cutting someone off the moment a card fails — before Stripe has finished
 * its retries — turns a recoverable payment problem into a support ticket and
 * a cancellation.
 */
export function planForSubscriptionStatus(status: string | null | undefined): Plan {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
      return 'pro';
    default:
      return 'free';
  }
}
