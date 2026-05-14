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
 * Called after each ambassador_sales insert. If the seller has a referrer
 * and reaches the validation threshold for the first time, marks the referral
 * validated and inserts a pending referral_payout row for the parrain.
 * Then checks milestones for the parrain.
 *
 * Returns the validation event if it fired, or null. Best-effort: never throws.
 */
export async function checkAndValidateReferral(
  service: ServiceClient,
  ambassadorId: string
): Promise<{ validated: true; referrerId: string; amountCents: number } | null> {
  try {
    const { data: amb } = await service
      .from('ambassadors')
      .select('id, referrer_ambassador_id, referral_validated_at')
      .eq('id', ambassadorId)
      .maybeSingle();

    if (!amb || !amb.referrer_ambassador_id || amb.referral_validated_at) return null;

    const { count } = await service
      .from('ambassador_sales')
      .select('id', { count: 'exact', head: true })
      .eq('ambassador_id', ambassadorId);

    if ((count ?? 0) < REFERRAL_VALIDATION_MIN_SALES) return null;

    const { error: updErr } = await service
      .from('ambassadors')
      .update({ referral_validated_at: new Date().toISOString() })
      .eq('id', ambassadorId)
      .is('referral_validated_at', null);

    if (updErr) return null;

    await service.from('referral_payouts').insert({
      referrer_ambassador_id: amb.referrer_ambassador_id,
      referred_ambassador_id: ambassadorId,
      amount_cents: REFERRAL_REWARDS.validation,
      reason: 'validation',
      status: 'pending',
    });

    await checkMilestones(service, amb.referrer_ambassador_id);

    return {
      validated: true,
      referrerId: amb.referrer_ambassador_id,
      amountCents: REFERRAL_REWARDS.validation,
    };
  } catch {
    return null;
  }
}

/**
 * Counts validated filleuls for a parrain and inserts milestone payouts
 * if thresholds were just reached. UNIQUE constraint on (referrer, referred, reason)
 * prevents double-insert; we use a sentinel referred_id (the parrain himself) for milestones.
 */
export async function checkMilestones(
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

    if (validatedCount >= 5) {
      await service.from('referral_payouts').insert({
        referrer_ambassador_id: referrerId,
        referred_ambassador_id: referrerId,
        amount_cents: REFERRAL_REWARDS.milestone_5,
        reason: 'milestone_5',
        status: 'pending',
      });
    }
    if (validatedCount >= 10) {
      await service.from('referral_payouts').insert({
        referrer_ambassador_id: referrerId,
        referred_ambassador_id: referrerId,
        amount_cents: REFERRAL_REWARDS.milestone_10,
        reason: 'milestone_10',
        status: 'pending',
      });
    }
  } catch {
    // Best-effort: milestones are recoverable manually if needed.
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
  pendingAdmin: number;       // candidatures referées encore en pending
  pendingSales: number;       // ambas créés mais < 3 ventes
  validated: number;          // referral_validated_at != null
  totalEarnedCents: number;   // somme des referral_payouts pour ce parrain
  toMilestone5: number;       // filleuls validés restants pour atteindre 5
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
      .select('amount_cents')
      .eq('referrer_ambassador_id', referrerId),
  ]);

  const refs = refsRes.data ?? [];
  const validated = refs.filter(r => r.referral_validated_at).length;
  const pendingSales = refs.length - validated;
  const totalEarnedCents = (payoutsRes.data ?? []).reduce(
    (sum, p) => sum + (p.amount_cents ?? 0),
    0
  );

  return {
    pendingAdmin: pendingAdminRes.count ?? 0,
    pendingSales,
    validated,
    totalEarnedCents,
    toMilestone5: Math.max(0, 5 - validated),
    toMilestone10: Math.max(0, 10 - validated),
  };
}
