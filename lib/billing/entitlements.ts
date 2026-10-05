// What Pro unlocks, for reference: the post-tip Google review invitation
// (enforced in SQL, see migrations 00076 and 00088), the compliments customers
// leave for whoever served them, and the tracking of the Google listing.
//
// The rule behind that split: nothing which increases tip volume is ever gated,
// because tips are the platform's own revenue and charging for them would be
// paying to earn less. Nor is anything that is simply the manager's own data:
// the payroll export, its full history and its monthly delivery to the
// accountant used to be Pro and are free since 00088, because a manager who
// has to pay to get their own figures out reads it as a hostage, not an offer.
// So Pro is reputational only, and the free plan keeps unlimited tips,
// unlimited staff, full history, full analytics and every export.
//
// This used to be a `PRO_FEATURES` object nothing imported. Each gate reads the
// plan where it stands, which is the only place the answer can be enforced, so
// the map was a second description of the rules that no code had to agree with.

import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

export type Plan = 'free' | 'pro';

type Service = ReturnType<typeof createServiceClient>;

/**
 * Whether a group's row grants Pro right now: a subscription the webhooks
 * recorded, or a cardless trial that has not run out. The same condition the
 * SQL functions apply (00088), kept in one place on this side too.
 */
export function effectivePlan(
  row: { plan?: string | null; pro_trial_ends_at?: string | null } | null | undefined,
  now: Date = new Date(),
): Plan {
  if (!row) return 'free';
  if (row.plan === 'pro') return 'pro';
  const ends = row.pro_trial_ends_at ? new Date(row.pro_trial_ends_at).getTime() : NaN;
  return Number.isFinite(ends) && ends > now.getTime() ? 'pro' : 'free';
}

/**
 * The group's current plan.
 *
 * Reads the column the Stripe webhooks maintain rather than asking Stripe:
 * entitlement checks sit on request paths that must not depend on a third
 * party being reachable. `customer.subscription.*` keeps it honest, and a
 * subscription that lapses is downgraded there. A cardless trial needs no
 * downgrade at all: it is a date, and it stops counting when it passes.
 */
export async function getPlan(service: Service, groupId: string): Promise<Plan> {
  const { data } = await service
    .from('groups')
    .select('plan, pro_trial_ends_at')
    .eq('id', groupId)
    .is('deleted_at', null)
    .maybeSingle();

  return effectivePlan(data);
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
