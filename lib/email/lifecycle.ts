import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe/client';
import { getBaseUrl } from '@/lib/env';
import { signLifecycleUnsubToken } from '@/lib/auth/lifecycle-unsub-token';

// The lifecycle tables / new columns are not in the generated DB types yet.
// `loose` returns a schema-untyped client so queries against them compile.
type AnyClient = SupabaseClient;
export type ServiceClient = SupabaseClient;
function loose(s: ServiceClient): AnyClient {
  return s as unknown as AnyClient;
}

export type Audience = 'group_admin' | 'staff';

export type LifecycleEmailDef = {
  key: string;
  audience: Audience;
  recurrence: 'one_shot' | 'recurring';
  transactional: boolean;
  /**
   * Neither blocked by the frequency cap nor counted in it. For a report the
   * reader expects on a fixed day (the Monday recap): letting a nudge sent on
   * Saturday swallow it would make it arrive some weeks and not others, and
   * letting it count would mute every nudge until Thursday.
   */
  capExempt?: boolean;
};

// Single source of truth for every automated email. The cron and the Stripe
// webhook both dispatch through these definitions.
//
// When each one goes out (app/api/cron/lifecycle-emails, daily at 09:00 UTC):
//   group_onboarding_nudge  sign-up unfinished: day 2, then day 6, then never
//   invite_team             nobody active on the team 3 days after sign-up, once
//   staff_missing_email     staff added without email, not joined: day 3, again 30 days later, then never
//   activation_no_tips      7 days live, plaques in hand 4 days, no tip: once
//   staff_invite_reminder   invited by email, not joined: day 3, then day 7
//   first_tip_celebration   on the first tip (webhook)
//   earnings_milestone      a staff member's tips pass 100 € and 500 € (webhook)
//   re_engagement           21 quiet days after at least 5 tips: once per quiet spell
//   weekly_tip_recap        Mondays, last Monday-to-Sunday, if there were tips
//   trial_ending            3 days before a Stripe trial converts
//   free_trial_ending       3 days before the cardless trial ends
export const LIFECYCLE: Record<string, LifecycleEmailDef> = {
  group_onboarding_nudge: { key: 'group_onboarding_nudge', audience: 'group_admin', recurrence: 'one_shot',  transactional: false },
  invite_team:            { key: 'invite_team',            audience: 'group_admin', recurrence: 'one_shot',  transactional: false },
  // Staff added without an email have user_id NULL, so resolveStaffRecipient
  // cannot reach them and no staff-audience sequence ever will. The admin is
  // the only reachable party, hence a group_admin email about a staff problem.
  staff_missing_email:    { key: 'staff_missing_email',    audience: 'group_admin', recurrence: 'one_shot',  transactional: false },
  activation_no_tips:     { key: 'activation_no_tips',     audience: 'group_admin', recurrence: 'one_shot',  transactional: false },
  staff_invite_reminder:  { key: 'staff_invite_reminder',  audience: 'staff',       recurrence: 'one_shot',  transactional: false },
  first_tip_celebration:  { key: 'first_tip_celebration',  audience: 'group_admin', recurrence: 'one_shot',  transactional: false },
  earnings_milestone:     { key: 'earnings_milestone',     audience: 'staff',       recurrence: 'one_shot',  transactional: false },
  re_engagement:          { key: 're_engagement',          audience: 'group_admin', recurrence: 'one_shot',  transactional: false },
  weekly_tip_recap:       { key: 'weekly_tip_recap',       audience: 'group_admin', recurrence: 'recurring', transactional: false, capExempt: true },
  // Transactional: it says what is about to be charged and when. Somebody who
  // unsubscribed from nudges still has to be told before their card is billed.
  trial_ending:           { key: 'trial_ending',           audience: 'group_admin', recurrence: 'one_shot',  transactional: true },
  // The cardless trial ending. Transactional although nothing is charged:
  // the CGU (art. 15.2) promise this email, so an opt-out from nudges must not
  // silence it. Its own key, so a group that later starts a Stripe trial still
  // gets the separate warning before that one is billed.
  free_trial_ending:      { key: 'free_trial_ending',      audience: 'group_admin', recurrence: 'one_shot',  transactional: true },
  // Retired, kept so the rows already in lifecycle_email_log still resolve:
  //  - tag_delivered_place repeated the delivery email a day later;
  //  - staff_banking_complete described tips paid to the employee's own bank
  //    account, which is not how Digitip works (they go to the establishment);
  //  - monthly_recap_free became the monthly statement every group gets.
  tag_delivered_place:    { key: 'tag_delivered_place',    audience: 'group_admin', recurrence: 'one_shot',  transactional: false },
  staff_banking_complete: { key: 'staff_banking_complete', audience: 'staff',       recurrence: 'one_shot',  transactional: true },
  monthly_recap_free:     { key: 'monthly_recap_free',     audience: 'group_admin', recurrence: 'recurring', transactional: false },
};

/** Keys whose sends neither trigger nor count toward the frequency cap. */
const CAP_EXEMPT_KEYS = Object.values(LIFECYCLE).filter((d) => d.capExempt).map((d) => d.key);

// No more than one non-transactional lifecycle email per recipient per N days.
export const FREQ_CAP_DAYS = 3;

// ─── Pure helpers (dependency-free module, unit-tested) ──────────────────────
export { firstNameFrom, isoWeekBucket, dayWindowBucket } from './lifecycle-helpers';

/** Builds the one-click unsubscribe URL (null when the secret is unset). */
export function lifecycleUnsubUrl(audience: Audience, subjectId: string): string | null {
  const token = signLifecycleUnsubToken(audience === 'staff' ? 'staff' : 'group', subjectId);
  return token ? `${getBaseUrl()}/api/lifecycle/unsubscribe/${token}` : null;
}

// ─── Recipient resolution ─────────────────────────────────────────────────────

export type GroupAdminRecipient = { email: string; locale: string; name: string | null };

/**
 * Resolves the group admin's email. Falls back to the Stripe customer email for
 * "ghost" groups — paid via express checkout but never created an account.
 */
export async function resolveGroupAdmin(
  service: ServiceClient,
  groupId: string
): Promise<GroupAdminRecipient | null> {
  const { data: role } = await loose(service)
    .from('user_roles')
    .select('user_id')
    .eq('role', 'group_admin')
    .eq('group_id', groupId)
    .limit(1)
    .maybeSingle();

  if (role?.user_id) {
    const { data } = await service.auth.admin.getUserById(role.user_id as string);
    const u = data?.user;
    if (u?.email) {
      return {
        email: u.email,
        locale: (u.user_metadata?.locale as string) || 'fr',
        name: (u.user_metadata?.full_name as string) || null,
      };
    }
  }

  // Ghost fallback: resolve email from the Stripe customer on the group.
  const { data: group } = await loose(service)
    .from('groups')
    .select('name, legal_name, stripe_customer_id')
    .eq('id', groupId)
    .maybeSingle();

  if (group?.stripe_customer_id) {
    try {
      const customer = await stripe.customers.retrieve(group.stripe_customer_id as string);
      if (customer && !('deleted' in customer && customer.deleted) && 'email' in customer && customer.email) {
        return {
          email: customer.email,
          locale: 'fr',
          name: (group.name as string) || (group.legal_name as string) || null,
        };
      }
    } catch {
      /* customer gone — give up */
    }
  }
  return null;
}

export type StaffRecipient = { email: string; locale: string; fullName: string | null };

export async function resolveStaffRecipient(
  service: ServiceClient,
  staffId: string
): Promise<StaffRecipient | null> {
  const { data: staff } = await loose(service)
    .from('staff_profiles')
    .select('user_id, full_name')
    .eq('id', staffId)
    .maybeSingle();
  if (!staff?.user_id) return null;

  const { data } = await service.auth.admin.getUserById(staff.user_id as string);
  const u = data?.user;
  if (!u?.email) return null;
  return {
    email: u.email,
    locale: (u.user_metadata?.locale as string) || 'fr',
    fullName: (staff.full_name as string) || (u.user_metadata?.full_name as string) || null,
  };
}

// ─── The unified dispatch path (cron + webhook) ───────────────────────────────

export type DispatchResult = 'sent' | 'skipped' | 'failed';

/**
 * Opt-out check → frequency cap → claim (dedup) → send → finalize log row.
 * `send` must call a lib/email.ts lifecycle template and return `{ id }`.
 */
export async function dispatchLifecycleEmail(
  service: ServiceClient,
  opts: {
    def: LifecycleEmailDef;
    groupId?: string | null;
    establishmentId?: string | null;
    staffId?: string | null;
    to: string;
    locale?: string;
    occurrenceSalt?: string;
    periodBucket?: string;
    send: () => Promise<{ id: string | null }>;
  }
): Promise<DispatchResult> {
  const { def } = opts;
  const groupId = opts.groupId ?? null;
  const establishmentId = opts.establishmentId ?? null;
  const staffId = opts.staffId ?? null;
  const db = loose(service);

  // 1 + 2. Opt-out (non-transactional emails) and frequency cap (those not exempt).
  if (!def.transactional) {
    if (def.audience === 'staff' && staffId) {
      const { data } = await db
        .from('staff_profiles')
        .select('lifecycle_emails_opt_out_at')
        .eq('id', staffId)
        .maybeSingle();
      if (data?.lifecycle_emails_opt_out_at) return 'skipped';
    } else if (def.audience === 'group_admin' && groupId) {
      const { data } = await db
        .from('groups')
        .select('lifecycle_emails_opt_out_at')
        .eq('id', groupId)
        .maybeSingle();
      if (data?.lifecycle_emails_opt_out_at) return 'skipped';
    }
  }
  if (!def.transactional && !def.capExempt) {
    const since = new Date(Date.now() - FREQ_CAP_DAYS * 86400000).toISOString();
    let capQ = db
      .from('lifecycle_email_log')
      .select('id')
      .eq('transactional', false)
      .eq('status', 'sent')
      .gte('sent_at', since)
      .limit(1);
    if (CAP_EXEMPT_KEYS.length) capQ = capQ.not('email_key', 'in', `(${CAP_EXEMPT_KEYS.join(',')})`);
    if (def.audience === 'staff' && staffId) capQ = capQ.eq('staff_id', staffId);
    else if (groupId) capQ = capQ.eq('group_id', groupId);
    else if (staffId) capQ = capQ.eq('staff_id', staffId);
    const { data: capHit } = await capQ;
    if (capHit && capHit.length > 0) return 'skipped';
  }

  // 3. Deterministic dedup key.
  const subjectId = staffId ?? establishmentId ?? groupId ?? 'none';
  const parts = [def.key, subjectId];
  if (opts.occurrenceSalt) parts.push(opts.occurrenceSalt);
  if (def.recurrence === 'recurring' && opts.periodBucket) parts.push(opts.periodBucket);
  const dedupKey = parts.join(':');

  // 4. Claim the slot — INSERT 'pending' before sending. A unique violation
  //    (23505) means another run/webhook already handled it.
  const { data: claimed, error: claimErr } = await db
    .from('lifecycle_email_log')
    .insert({
      email_key: def.key,
      audience: def.audience,
      transactional: def.transactional,
      group_id: groupId,
      establishment_id: establishmentId,
      staff_id: staffId,
      to_email: opts.to,
      locale: opts.locale || 'fr',
      dedup_key: dedupKey,
      status: 'pending',
    })
    .select('id')
    .single();

  if (claimErr || !claimed) {
    const code = (claimErr as { code?: string } | null)?.code;
    if (code && code !== '23505') {
      console.error('[lifecycle] claim insert failed', dedupKey, claimErr);
    }
    return 'skipped';
  }

  // 5. Send, then finalize the row (pending -> sent / failed).
  try {
    const { id } = await opts.send();
    await db
      .from('lifecycle_email_log')
      .update({ status: 'sent', resend_id: id, sent_at: new Date().toISOString() })
      .eq('id', claimed.id);
    return 'sent';
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    console.error('[lifecycle] send failed', dedupKey, msg);
    await db
      .from('lifecycle_email_log')
      .update({ status: 'failed', error: msg })
      .eq('id', claimed.id);
    return 'failed';
  }
}

/**
 * How many times `key` was sent about this subject, and when last. Lets a
 * daily sequence say "again 30 days later, at most twice" without the fixed
 * calendar buckets that used to allow two sends a day apart across a bucket
 * boundary.
 */
export async function sendHistory(
  service: ServiceClient,
  key: string,
  subject: { groupId?: string | null; establishmentId?: string | null; staffId?: string | null },
): Promise<{ count: number; lastSentAt: Date | null }> {
  let q = loose(service)
    .from('lifecycle_email_log')
    .select('sent_at')
    .eq('email_key', key)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(50);
  if (subject.staffId) q = q.eq('staff_id', subject.staffId);
  else if (subject.establishmentId) q = q.eq('establishment_id', subject.establishmentId);
  else if (subject.groupId) q = q.eq('group_id', subject.groupId);
  const { data } = await q;
  const rows = (data ?? []) as Array<{ sent_at: string | null }>;
  return { count: rows.length, lastSentAt: rows[0]?.sent_at ? new Date(rows[0].sent_at) : null };
}
