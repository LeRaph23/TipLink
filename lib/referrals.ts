import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { REFERRAL_REWARDS, REFERRAL_VALIDATION_MIN_SALES } from './ambassador-tiers';

type ServiceClient = SupabaseClient<Database>;

/**
 * Generates a human-readable referral code like "AMB-LUCAS-7K3".
 * Uppercases the name, strips non-alpha, truncates to 8 chars, appends 3 random base32 chars.
 */
export function generateReferralCode(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 8) || 'AMBA';
  const random = crypto.randomBytes(3).toString('base64')
    .replace(/[+/=]/g, '')
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'X');
  return `AMB-${slug}-${random}`;
}

/**
 * Tries to generate a unique referral code, retrying on collision.
 * Returns null after maxAttempts.
 */
export async function generateUniqueReferralCode(
  service: ServiceClient,
  name: string,
  maxAttempts = 8
): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generateReferralCode(name);
    const { data } = await service
      .from('ambassadors')
      .select('id')
      .eq('referral_code', candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return null;
}

/**
 * Counts a referred ambassador's *live* (non-voided) sales. Voided sales —
 * refunded / charged-back / canceled orders — must not count toward the
 * referral validation threshold, otherwise a parrain banks 25€ on revenue
 * the platform never kept.
 */
async function countLiveSales(
  service: ServiceClient,
  ambassadorId: string
): Promise<number> {
  const { count } = await service
    .from('ambassador_sales')
    .select('id', { count: 'exact', head: true })
    .eq('ambassador_id', ambassadorId)
    .is('voided_at', null);
  return count ?? 0;
}

/**
 * Re-evaluates a referred ambassador's referral state from scratch and brings
 * the parrain's validation + milestone payouts in line with it.
 *
 * Idempotent and best-effort (never throws). Called both when a sale is added
 * and when one is voided/restored, so it must converge to the correct state
 * regardless of direction:
 *  - >=3 live sales  → referral validated, validation payout pending.
 *  - <3 live sales   → validation cleared; a still-PENDING validation payout is
 *                      voided. A payout a super-admin already CREDITED is left
 *                      untouched (manual reconciliation — never silently undo
 *                      money already sent).
 * Milestones are recomputed afterwards from the parrain's validated-filleul count.
 */
export async function recomputeReferralAfterSaleChange(
  service: ServiceClient,
  referredAmbassadorId: string
): Promise<void> {
  try {
    const { data: amb } = await service
      .from('ambassadors')
      .select('id, referrer_ambassador_id, referral_validated_at')
      .eq('id', referredAmbassadorId)
      .maybeSingle();

    if (!amb || !amb.referrer_ambassador_id) return;
    const referrerId = amb.referrer_ambassador_id;

    const liveSales = await countLiveSales(service, referredAmbassadorId);
    const shouldValidate = liveSales >= REFERRAL_VALIDATION_MIN_SALES;

    const { data: payout } = await service
      .from('referral_payouts')
      .select('id, status')
      .eq('referrer_ambassador_id', referrerId)
      .eq('referred_ambassador_id', referredAmbassadorId)
      .eq('reason', 'validation')
      .maybeSingle();

    if (shouldValidate) {
      if (!amb.referral_validated_at) {
        await service
          .from('ambassadors')
          .update({ referral_validated_at: new Date().toISOString() })
          .eq('id', referredAmbassadorId);
      }
      if (!payout) {
        await service.from('referral_payouts').insert({
          referrer_ambassador_id: referrerId,
          referred_ambassador_id: referredAmbassadorId,
          amount_cents: REFERRAL_REWARDS.validation,
          reason: 'validation',
          status: 'pending',
        });
      } else if (payout.status === 'voided') {
        await service
          .from('referral_payouts')
          .update({ status: 'pending' })
          .eq('id', payout.id);
      }
    } else {
      if (amb.referral_validated_at) {
        await service
          .from('ambassadors')
          .update({ referral_validated_at: null })
          .eq('id', referredAmbassadorId);
      }
      if (payout && payout.status === 'pending') {
        await service
          .from('referral_payouts')
          .update({ status: 'voided' })
          .eq('id', payout.id);
      }
    }

    await recomputeMilestones(service, referrerId);
  } catch {
    // Best-effort: referral payouts are super-admin reviewed before being paid.
  }
}

/**
 * Brings a parrain's milestone payouts in line with their current count of
 * validated filleuls. Idempotent: re-opens a voided milestone when the
 * threshold is met again, voids a still-pending milestone when it is no longer
 * met, and never touches a milestone already credited by a super-admin.
 */
export async function recomputeMilestones(
  service: ServiceClient,
  referrerId: string
): Promise<void> {
  try {
    const { count } = await service
      .from('ambassadors')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_ambassador_id', referrerId)
      .not('referral_validated_at', 'is', null);

    const validatedCount = count ?? 0;

    const milestones = [
      { threshold: 5, reason: 'milestone_5' as const, amount: REFERRAL_REWARDS.milestone_5 },
      { threshold: 10, reason: 'milestone_10' as const, amount: REFERRAL_REWARDS.milestone_10 },
    ];

    for (const m of milestones) {
      const { data: payout } = await service
        .from('referral_payouts')
        .select('id, status')
        .eq('referrer_ambassador_id', referrerId)
        .eq('referred_ambassador_id', referrerId)
        .eq('reason', m.reason)
        .maybeSingle();

      const met = validatedCount >= m.threshold;

      if (met) {
        if (!payout) {
          await service.from('referral_payouts').insert({
            referrer_ambassador_id: referrerId,
            referred_ambassador_id: referrerId,
            amount_cents: m.amount,
            reason: m.reason,
            status: 'pending',
          });
        } else if (payout.status === 'voided') {
          await service
            .from('referral_payouts')
            .update({ status: 'pending' })
            .eq('id', payout.id);
        }
      } else if (payout && payout.status === 'pending') {
        await service
          .from('referral_payouts')
          .update({ status: 'voided' })
          .eq('id', payout.id);
      }
    }
  } catch {
    // Best-effort: milestones are recoverable manually if needed.
  }
}

/**
 * Called after each ambassador_sales insert. Re-evaluates the seller's referral
 * state and returns the validation event the first time it fires (so the caller
 * can email the parrain). Best-effort: never throws.
 */
export async function checkAndValidateReferral(
  service: ServiceClient,
  ambassadorId: string
): Promise<{ validated: true; referrerId: string; amountCents: number } | null> {
  try {
    const { data: before } = await service
      .from('ambassadors')
      .select('id, referrer_ambassador_id, referral_validated_at')
      .eq('id', ambassadorId)
      .maybeSingle();

    if (!before || !before.referrer_ambassador_id) return null;
    const wasValidated = !!before.referral_validated_at;

    await recomputeReferralAfterSaleChange(service, ambassadorId);
    if (wasValidated) return null;

    const { data: after } = await service
      .from('ambassadors')
      .select('referral_validated_at')
      .eq('id', ambassadorId)
      .maybeSingle();

    if (!after?.referral_validated_at) return null;

    return {
      validated: true,
      referrerId: before.referrer_ambassador_id,
      amountCents: REFERRAL_REWARDS.validation,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves a referral code to its ambassador id. Returns null if not found.
 */
export async function resolveReferralCode(
  service: ServiceClient,
  code: string
): Promise<{ id: string; name: string } | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const { data } = await service
    .from('ambassadors')
    .select('id, name')
    .eq('referral_code', normalized)
    .eq('is_active', true)
    .maybeSingle();
  return data ?? null;
}

export type ReferralStats = {
  pendingAdmin: number;         // candidatures referées encore en pending
  pendingSales: number;         // ambas créés mais < 3 ventes
  validated: number;            // referral_validated_at != null
  totalEarnedCents: number;     // referral_payouts CRÉDITÉS par le super-admin
  awaitingCreditCents: number;  // referral_payouts en attente de validation admin
  toMilestone5: number;         // filleuls validés restants pour atteindre 5
  toMilestone10: number;
};

export async function getReferralStats(
  service: ServiceClient,
  referrerId: string
): Promise<ReferralStats> {
  const [pendingAdminRes, refsRes, payoutsRes] = await Promise.all([
    service
      .from('ambassador_recruitment_applications')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_ambassador_id', referrerId)
      .eq('status', 'pending'),
    service
      .from('ambassadors')
      .select('id, referral_validated_at')
      .eq('referrer_ambassador_id', referrerId),
    service
      .from('referral_payouts')
      .select('amount_cents, status')
      .eq('referrer_ambassador_id', referrerId)
      .neq('status', 'voided'),
  ]);

  const refs = refsRes.data ?? [];
  const validated = refs.filter(r => r.referral_validated_at).length;
  const pendingSales = refs.length - validated;
  // Only rewards a super-admin has actually credited count as earned money —
  // a `pending` reward is awaiting admin validation and is not yet the
  // parrain's to withdraw.
  const payouts = payoutsRes.data ?? [];
  const totalEarnedCents = payouts
    .filter(p => p.status === 'credited')
    .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
  const awaitingCreditCents = payouts
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);

  return {
    pendingAdmin: pendingAdminRes.count ?? 0,
    pendingSales,
    validated,
    totalEarnedCents,
    awaitingCreditCents,
    toMilestone5: Math.max(0, 5 - validated),
    toMilestone10: Math.max(0, 10 - validated),
  };
}

/**
 * Sum (in cents) of referral rewards a super-admin has explicitly credited to
 * this parrain. Credited rewards become part of the parrain's withdrawable
 * balance; `pending` ones do not (they await admin validation).
 */
export async function sumCreditedReferralCents(
  service: ServiceClient,
  referrerId: string
): Promise<number> {
  const { data } = await service
    .from('referral_payouts')
    .select('amount_cents')
    .eq('referrer_ambassador_id', referrerId)
    .eq('status', 'credited');
  return (data ?? []).reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
}
