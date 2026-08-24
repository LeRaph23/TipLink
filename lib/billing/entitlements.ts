import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

export type Plan = 'free' | 'pro';

/**
 * What each plan unlocks.
 *
 * The rule behind this split: nothing that increases tip volume is ever gated,
 * because tips are the platform's own revenue — charging for them would be
 * paying to earn less. So Pro is administrative and reputational only, and the
 * free plan keeps unlimited tips, unlimited staff, full history and full
 * analytics.
 */
export const PRO_FEATURES = {
  /** Post-tip Google review invitation (enforced in SQL, see 00076). */
  googleReviews: true,
  /** Payroll export beyond the current month, extra formats, monthly email. */
  payrollExport: true,
} as const;

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
