import 'server-only';
import type { createServiceClient } from '@/lib/supabase/service';
import { TRIAL_DAYS } from './trial';

type Service = ReturnType<typeof createServiceClient>;

/**
 * Starts the cardless Pro trial on a group's first real tip, once.
 *
 * Why the first tip and not sign-up: Pro is worth exactly what it does to
 * customers, and before the first tip there are none. A trial that starts at
 * sign-up mostly runs out while the plaque is still in the post, then asks
 * for money on the strength of nothing.
 *
 * Why no card: the old trial went through Stripe Checkout, so a manager had to
 * hand over a card for a feature they had never seen work. Now they see it
 * work on their own customers first, and the card comes at the end, with the
 * month's figures beside the button.
 *
 * Eligible only when the group has never had a trial of either kind and has
 * no subscription. The conditions live in the UPDATE itself, so two tips
 * landing at once cannot both start one, and a webhook replay is a no-op.
 *
 * Never throws: it runs inside the payment webhook, and a trial that fails to
 * start is a lost upsell, while a webhook that fails is a tip nobody records.
 */
export async function startFreeTrialOnFirstTip(
  service: Service,
  establishmentId: string,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const { data: est } = await service
      .from('establishments')
      .select('group_id, is_demo')
      .eq('id', establishmentId)
      .maybeSingle();
    if (!est?.group_id || est.is_demo) return false;

    return await startFreeTrial(service, est.group_id, now);
  } catch (err) {
    console.error('[free-trial] could not start', establishmentId, err);
    return false;
  }
}

/**
 * Starts the cardless trial for a group if it has never had a trial and has
 * no subscription. Used by the first tip, and by the offer's button for a
 * manager who wants to see it before any tip has come in. The conditions are
 * in the UPDATE, so a double click cannot start two.
 */
export async function startFreeTrial(
  service: Service,
  groupId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const endsAt = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
  const { data } = await service
    .from('groups')
    .update({
      pro_trial_started_at: now.toISOString(),
      pro_trial_ends_at: endsAt.toISOString(),
    } as never)
    .eq('id', groupId)
    .eq('plan', 'free')
    .is('pro_trial_started_at', null)
    .is('trial_ends_at', null)
    .is('stripe_subscription_id', null)
    .is('deleted_at', null)
    .select('id');
  return (data?.length ?? 0) > 0;
}
