import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { tipAmountOf } from '@/lib/tips/amounts';
import { isAuthorizedCronRequest } from '@/lib/auth/require-cron';
import { getBaseUrl } from '@/lib/env';
import { signOnboardingToken } from '@/lib/auth/onboarding-token';
import {
  LIFECYCLE,
  dispatchLifecycleEmail,
  resolveGroupAdmin,
  resolveStaffRecipient,
  firstNameFrom,
  lifecycleUnsubUrl,
  isoWeekBucket,
  sendHistory,
} from '@/lib/email/lifecycle';
import { lastParisWeek, weekLabel } from '@/lib/email/lifecycle-helpers';
import {
  sendGroupOnboardingNudge,
  sendInviteTeamNudge,
  sendStaffMissingEmailNudge,
  sendActivationNudge,
  sendStaffInviteReminder,
  sendReEngagementEmail,
  sendWeeklyTipRecap,
  sendTrialEndingSoon,
  sendFreeTrialEndingSoon,
} from '@/lib/email';
import { deriveTrialState, isTrialWarningDue } from '@/lib/billing/trial';
import { getReviewImpact } from '@/lib/billing/review-teaser';
import { getProImpact } from '@/lib/billing/pro-impact';
import { longDate } from '@/lib/format/long-date';
import { getProPricing } from '@/lib/billing/pro-pricing';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DAY = 86400000;
const LIMIT = 300;

type Tally = { considered: number; sent: number; skipped: number; failed: number };
const newTally = (): Tally => ({ considered: 0, sent: 0, skipped: 0, failed: 0 });

// The lifecycle queries touch columns not present in the generated DB types.
type Db = SupabaseClient;

// ─── Group admin: onboarding not completed (day 2, then day 6, then never) ───
async function runGroupOnboardingNudges(service: Db, dryRun: boolean): Promise<Tally> {
  const t = newTally();
  const now = Date.now();
  const { data: groups } = await service
    .from('groups')
    .select('id, created_at')
    .is('onboarding_completed_at', null)
    .is('deleted_at', null)
    .lt('created_at', new Date(now - 2 * DAY).toISOString())
    .gt('created_at', new Date(now - 30 * DAY).toISOString())
    .limit(LIMIT);

  if (dryRun) { t.considered = (groups ?? []).length; return t; }

  for (const g of groups ?? []) {
    t.considered++;
    try {
      // Previously gated on the group having a paid smarttag_orders row, which
      // meant this sequence could never fire for a group that signed up but had
      // not ordered — exactly the group most worth nudging. With zero paid
      // orders in production it had never fired at all. A group that created an
      // account and abandoned onboarding is a legitimate recipient whether or
      // not it has bought anything.
      const recipient = await resolveGroupAdmin(service, g.id);
      if (!recipient) { t.skipped++; continue; }

      const ageDays = (now - new Date(g.created_at).getTime()) / DAY;
      const step: 1 | 2 = ageDays >= 6 ? 2 : 1;
      const setupUrl =
        `${getBaseUrl()}/onboarding?group=${g.id}` +
        `&token=${encodeURIComponent(signOnboardingToken(g.id, recipient.email))}` +
        `&email=${encodeURIComponent(recipient.email)}`;
      const unsub = lifecycleUnsubUrl('group_admin', g.id);

      const r = await dispatchLifecycleEmail(service, {
        def: LIFECYCLE.group_onboarding_nudge,
        groupId: g.id,
        to: recipient.email,
        locale: recipient.locale,
        occurrenceSalt: `step${step}`,
        send: () => sendGroupOnboardingNudge({
          to: recipient.email,
          locale: recipient.locale,
          firstName: firstNameFrom(recipient.name),
          setupUrl,
          step,
          unsubscribeUrl: unsub,
        }),
      });
      t[r]++;
    } catch (e) {
      t.failed++;
      console.error('[lifecycle] group onboarding nudge failed', g.id, e);
    }
  }
  return t;
}

type Est = { id: string; name: string };

// Batch helpers — preload once per sequence instead of per group/establishment
// (the loops below run up to LIMIT groups, so the old per-group lookups were a
// classic N+1). One IN query each.
async function establishmentsByGroup(service: Db, groupIds: string[]): Promise<Map<string, Est[]>> {
  const out = new Map<string, Est[]>();
  if (groupIds.length === 0) return out;
  const { data } = await service
    .from('establishments')
    .select('id, name, group_id')
    .in('group_id', groupIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  for (const e of (data ?? []) as Array<{ id: string; name: string; group_id: string }>) {
    const arr = out.get(e.group_id) ?? [];
    arr.push({ id: e.id, name: e.name });
    out.set(e.group_id, arr);
  }
  return out;
}

async function establishmentsWithSucceededTip(service: Db, establishmentIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (establishmentIds.length === 0) return out;
  const { data } = await service
    .from('transactions')
    .select('establishment_id')
    .in('establishment_id', establishmentIds)
    .eq('status', 'succeeded');
  for (const r of (data ?? []) as Array<{ establishment_id: string | null }>) {
    if (r.establishment_id) out.add(r.establishment_id);
  }
  return out;
}

// ─── Group admin: hardware delivered, no tip yet → place the tag ─────────────
// ─── Group admin: onboarded but no team / no tips ────────────────────────────
//
// invite_team: nobody active on the team three days after sign-up. With no
// active staff member the tip page has no one to tip and turns customers
// away, so this is the most urgent nudge after the sign-up itself.
//
// activation_no_tips: a week after sign-up, still no tip, while there IS
// someone to tip and the plaques have been in hand for at least four days.
// Without those two conditions the email blamed the manager for plaques
// still in the post.
const IN_TRANSIT = ['pending_fulfillment', 'encoding', 'ready_to_ship', 'shipped'];

async function runTeamAndActivationNudges(service: Db, dryRun: boolean): Promise<{ team: Tally; activation: Tally }> {
  const team = newTally();
  const activation = newTally();
  const now = Date.now();
  const { data: groups } = await service
    .from('groups')
    .select('id, onboarding_completed_at')
    .not('onboarding_completed_at', 'is', null)
    .is('deleted_at', null)
    .lt('onboarding_completed_at', new Date(now - 3 * DAY).toISOString())
    .gt('onboarding_completed_at', new Date(now - 60 * DAY).toISOString())
    .limit(LIMIT);

  if (dryRun) { team.considered = activation.considered = (groups ?? []).length; return { team, activation }; }

  const groupIds = (groups ?? []).map((g) => g.id);
  const estByGroup = await establishmentsByGroup(service, groupIds);
  const allEstIds = [...estByGroup.values()].flat().map((e) => e.id);
  const tipped = await establishmentsWithSucceededTip(service, allEstIds);

  const activeByEst = new Map<string, number>();
  if (allEstIds.length > 0) {
    const { data: staffRows } = await service
      .from('staff_profiles')
      .select('establishment_id')
      .in('establishment_id', allEstIds)
      .eq('is_active', true)
      .is('deleted_at', null);
    for (const s of (staffRows ?? []) as Array<{ establishment_id: string | null }>) {
      if (s.establishment_id) activeByEst.set(s.establishment_id, (activeByEst.get(s.establishment_id) ?? 0) + 1);
    }
  }

  // Plaques: still on their way, or delivered too recently to judge.
  const plaquesNotReady = new Set<string>();
  if (groupIds.length > 0) {
    const { data: orders } = await service
      .from('smarttag_orders')
      .select('group_id, status, delivered_at')
      .in('group_id', groupIds);
    for (const o of (orders ?? []) as Array<{ group_id: string | null; status: string; delivered_at: string | null }>) {
      if (!o.group_id) continue;
      const recentlyDelivered = o.status === 'delivered' && o.delivered_at && now - new Date(o.delivered_at).getTime() < 4 * DAY;
      if (IN_TRANSIT.includes(o.status) || recentlyDelivered) plaquesNotReady.add(o.group_id);
    }
  }

  for (const g of groups ?? []) {
    try {
      const ests = estByGroup.get(g.id) ?? [];
      const estIds = ests.map((e) => e.id);
      const recipient = await resolveGroupAdmin(service, g.id);
      if (!recipient) continue;
      const unsub = lifecycleUnsubUrl('group_admin', g.id);
      const firstName = firstNameFrom(recipient.name);
      const estName = ests[0]?.name ?? (recipient.locale.startsWith('en') ? 'your business' : 'votre établissement');
      const activeStaff = estIds.reduce((sum, id) => sum + (activeByEst.get(id) ?? 0), 0);

      if (activeStaff === 0) {
        team.considered++;
        const r = await dispatchLifecycleEmail(service, {
          def: LIFECYCLE.invite_team,
          groupId: g.id,
          establishmentId: ests[0]?.id ?? null,
          to: recipient.email,
          locale: recipient.locale,
          send: () => sendInviteTeamNudge({
            to: recipient.email, firstName, establishmentName: estName, locale: recipient.locale,
            inviteUrl: `${getBaseUrl()}/dashboard/staff`, unsubscribeUrl: unsub,
          }),
        });
        team[r]++;
        continue;
      }

      const daysSince = Math.floor((now - new Date(g.onboarding_completed_at).getTime()) / DAY);
      const hasTip = estIds.some((id) => tipped.has(id));
      if (daysSince >= 7 && !hasTip && !plaquesNotReady.has(g.id)) {
        activation.considered++;
        const r = await dispatchLifecycleEmail(service, {
          def: LIFECYCLE.activation_no_tips,
          groupId: g.id,
          establishmentId: ests[0]?.id ?? null,
          to: recipient.email,
          locale: recipient.locale,
          send: () => sendActivationNudge({
            to: recipient.email, firstName, establishmentName: estName, locale: recipient.locale,
            dashboardUrl: `${getBaseUrl()}/dashboard`, daysSince, unsubscribeUrl: unsub,
          }),
        });
        activation[r]++;
      }
    } catch (e) {
      console.error('[lifecycle] team/activation nudge failed', g.id, e);
    }
  }
  return { team, activation };
}

// ─── Staff: invitation not claimed (J+3 step 1, J+7 step 2) ──────────────────
async function runStaffInviteReminders(service: Db, dryRun: boolean): Promise<Tally> {
  const t = newTally();
  const now = Date.now();
  const { data: staff } = await service
    .from('staff_profiles')
    .select('id, created_at, establishment_id, establishments(name)')
    .eq('is_active', false)
    .is('deleted_at', null)
    .lt('created_at', new Date(now - 3 * DAY).toISOString())
    .gt('created_at', new Date(now - 30 * DAY).toISOString())
    .limit(LIMIT);

  if (dryRun) { t.considered = (staff ?? []).length; return t; }

  for (const s of staff ?? []) {
    t.considered++;
    try {
      const recipient = await resolveStaffRecipient(service, s.id);
      if (!recipient) { t.skipped++; continue; }
      const ageDays = (now - new Date(s.created_at).getTime()) / DAY;
      const step: 1 | 2 = ageDays >= 7 ? 2 : 1;
      const estName =
        (s.establishments as { name?: string } | null)?.name ?? (recipient.locale.startsWith('en') ? 'your business' : 'votre établissement');
      const unsub = lifecycleUnsubUrl('staff', s.id);

      const r = await dispatchLifecycleEmail(service, {
        def: LIFECYCLE.staff_invite_reminder,
        staffId: s.id,
        establishmentId: s.establishment_id,
        to: recipient.email,
        locale: recipient.locale,
        occurrenceSalt: `step${step}`,
        send: () => sendStaffInviteReminder({
          to: recipient.email,
          locale: recipient.locale,
          firstName: firstNameFrom(recipient.fullName),
          establishmentName: estName,
          joinUrl: `${getBaseUrl()}/login`,
          step,
          unsubscribeUrl: unsub,
        }),
      });
      t[r]++;
    } catch (e) {
      t.failed++;
      console.error('[lifecycle] staff invite reminder failed', s.id, e);
    }
  }
  return t;
}

// ─── Group admin: an establishment that used to get tips went quiet ──────────
//
// Once per quiet spell: the occurrence is the date of the last tip, so a new
// email can only follow a new tip and a new silence. The old 30-day calendar
// bucket could send twice a day apart when the bucket rolled over. At least
// five tips before the silence, otherwise it is an activation problem, which
// has its own email.
const QUIET_DAYS = 21;
const MIN_TIPS_BEFORE_QUIET = 5;

async function runReEngagementNudges(service: Db, dryRun: boolean): Promise<Tally> {
  const t = newTally();
  const now = Date.now();
  const { data: txns } = await service
    .from('transactions')
    .select('establishment_id, succeeded_at')
    .eq('status', 'succeeded')
    .gte('succeeded_at', new Date(now - 60 * DAY).toISOString())
    .order('succeeded_at', { ascending: false })
    .limit(5000);

  const latest = new Map<string, string>();
  for (const row of txns ?? []) {
    if (row.establishment_id && !latest.has(row.establishment_id)) latest.set(row.establishment_id, row.succeeded_at);
  }
  const candidates = [...latest.entries()]
    .filter(([, ts]) => now - new Date(ts).getTime() >= QUIET_DAYS * DAY)
    .map(([id, ts]) => ({ id, ts }));

  if (dryRun) { t.considered = candidates.length; return t; }
  if (candidates.length === 0) return t;

  const { data: ests } = await service
    .from('establishments')
    .select('id, name, group_id')
    .in('id', candidates.map((c) => c.id))
    .is('deleted_at', null);
  const estById = new Map((ests ?? []).map((e) => [e.id, e]));

  for (const c of candidates) {
    const est = estById.get(c.id);
    if (!est?.group_id) continue;
    t.considered++;
    try {
      const { count } = await service
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('establishment_id', c.id)
        .eq('status', 'succeeded');
      if ((count ?? 0) < MIN_TIPS_BEFORE_QUIET) { t.skipped++; continue; }

      const recipient = await resolveGroupAdmin(service, est.group_id);
      if (!recipient) { t.skipped++; continue; }
      const daysQuiet = Math.floor((now - new Date(c.ts).getTime()) / DAY);

      const r = await dispatchLifecycleEmail(service, {
        def: LIFECYCLE.re_engagement,
        groupId: est.group_id,
        establishmentId: est.id,
        to: recipient.email,
        locale: recipient.locale,
        occurrenceSalt: c.ts.slice(0, 10),
        send: () => sendReEngagementEmail({
          to: recipient.email,
          locale: recipient.locale,
          firstName: firstNameFrom(recipient.name),
          establishmentName: est.name ?? '',
          daysQuiet,
          dashboardUrl: `${getBaseUrl()}/dashboard`,
          unsubscribeUrl: lifecycleUnsubUrl('group_admin', est.group_id),
        }),
      });
      t[r]++;
    } catch (e) {
      t.failed++;
      console.error('[lifecycle] re-engagement failed', est.id, e);
    }
  }
  return t;
}

// ─── Group admin: the cardless Pro trial ends in three days ─────────────────
//
// No card on file, so no charge to warn about: what is at stake is Pro
// switching off unnoticed. Same window and one-shot dedup as the Stripe one.
async function runFreeTrialEndingWarnings(service: Db, dryRun: boolean): Promise<Tally> {
  const t = newTally();
  const now = new Date();

  const { data: groups } = await service
    .from('groups')
    .select('id, name, plan, subscription_status, trial_ends_at, pro_trial_started_at, pro_trial_ends_at')
    .not('pro_trial_ends_at', 'is', null)
    .gt('pro_trial_ends_at', now.toISOString())
    .eq('plan', 'free')
    .is('deleted_at', null)
    .limit(LIMIT);

  const due = (groups ?? [])
    .map((g) => ({
      group: g,
      trial: deriveTrialState({
        plan: g.plan,
        subscriptionStatus: g.subscription_status,
        trialEndsAt: g.trial_ends_at,
        freeTrialEndsAt: g.pro_trial_ends_at,
      }, now),
    }))
    .filter(({ trial }) => trial.state === 'trialing' && trial.cardless && isTrialWarningDue(trial));

  if (dryRun) { t.considered = due.length; return t; }
  if (due.length === 0) return t;

  const pricing = await getProPricing().catch(() => null);
  const priceLabel = pricing?.monthly
    ? new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: pricing.monthly.currency.toUpperCase(),
        minimumFractionDigits: pricing.monthly.unitAmount % 100 === 0 ? 0 : 2,
      }).format(pricing.monthly.unitAmount / 100)
    : null;

  for (const { group, trial } of due) {
    if (trial.state !== 'trialing') continue;
    t.considered++;
    try {
      const recipient = await resolveGroupAdmin(service, group.id);
      if (!recipient) { t.skipped++; continue; }

      const impact = await getProImpact(
        service as unknown as Parameters<typeof getProImpact>[0],
        group.id,
        new Date(group.pro_trial_started_at ?? now.toISOString()),
      );

      const r = await dispatchLifecycleEmail(service, {
        def: LIFECYCLE.free_trial_ending,
        groupId: group.id,
        to: recipient.email,
        locale: recipient.locale,
        send: () => sendFreeTrialEndingSoon({
          to: recipient.email,
          locale: recipient.locale,
          firstName: firstNameFrom(recipient.name),
          establishmentName: group.name ?? 'votre établissement',
          daysLeft: trial.daysLeft,
          endDate: longDate(trial.endsAt, 'fr'),
          priceLabel,
          tipCount: impact?.tipCount ?? 0,
          clickCount: impact?.clickCount ?? 0,
          complimentCount: impact?.complimentCount ?? 0,
          billingUrl: `${getBaseUrl()}/dashboard/billing#pro`,
        }),
      });
      t[r]++;
    } catch (e) {
      t.failed++;
      console.error('[lifecycle] free-trial-ending failed', group.id, e);
    }
  }
  return t;
}

// ─── Group admin: the Pro trial converts in three days ───────────────────────
//
// The one email a trial owes its customer. It fires from a window rather than
// an exact day count, because a cron run that is late or retried must not
// silently skip the only warning anybody gets before their card is charged;
// the one-shot dedup in `lifecycle_email_log` is what keeps it to one send.
async function runTrialEndingWarnings(service: Db, dryRun: boolean): Promise<Tally> {
  const t = newTally();
  const now = new Date();

  const { data: groups } = await service
    .from('groups')
    .select('id, name, plan, subscription_status, trial_ends_at')
    .not('trial_ends_at', 'is', null)
    .gt('trial_ends_at', now.toISOString())
    .is('deleted_at', null)
    .limit(LIMIT);

  const due = (groups ?? [])
    .map((g) => ({
      group: g,
      trial: deriveTrialState({
        plan: g.plan,
        subscriptionStatus: g.subscription_status,
        trialEndsAt: g.trial_ends_at,
      }, now),
    }))
    .filter(({ trial }) => isTrialWarningDue(trial));

  if (dryRun) { t.considered = due.length; return t; }
  if (due.length === 0) return t;

  // One Stripe read for the whole batch, and it is allowed to fail: an email
  // that says the trial is ending is worth sending without the price in it.
  const pricing = await getProPricing().catch(() => null);
  const priceLabel = pricing?.monthly
    ? new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: pricing.monthly.currency.toUpperCase(),
        minimumFractionDigits: pricing.monthly.unitAmount % 100 === 0 ? 0 : 2,
      }).format(pricing.monthly.unitAmount / 100)
    : null;

  for (const { group, trial } of due) {
    if (trial.state !== 'trialing') continue;
    t.considered++;
    try {
      const recipient = await resolveGroupAdmin(service, group.id);
      if (!recipient) { t.skipped++; continue; }

      const impact = await getReviewImpact(
        service as unknown as Parameters<typeof getReviewImpact>[0],
        group.id,
      );

      const r = await dispatchLifecycleEmail(service, {
        def: LIFECYCLE.trial_ending,
        groupId: group.id,
        to: recipient.email,
        locale: recipient.locale,
        send: () => sendTrialEndingSoon({
          to: recipient.email,
          locale: recipient.locale,
          firstName: firstNameFrom(recipient.name),
          establishmentName: group.name ?? 'votre établissement',
          daysLeft: trial.daysLeft,
          priceLabel,
          tipCount: impact?.tipCount ?? 0,
          clickCount: impact?.clickCount ?? 0,
          billingUrl: `${getBaseUrl()}/dashboard/billing`,
        }),
      });
      t[r]++;
    } catch (e) {
      t.failed++;
      console.error('[lifecycle] trial-ending failed', group.id, e);
    }
  }
  return t;
}

// ─── Group admin: Monday recap of last week's tips ───────────────────────────
//
// The previous calendar week, Monday 00:00 to Monday 00:00 Paris time, so
// the email's "semaine du 29 septembre au 5 octobre" is literally true. It
// used to be the last 168 hours before 09:00 UTC, which straddled two weeks.
// One email per group, listing each establishment, instead of one per
// establishment, of which the frequency cap let only the first through.

async function runWeeklyRecap(service: Db, dryRun: boolean): Promise<Tally> {
  const t = newTally();
  const { start, end } = lastParisWeek(new Date());
  const { data: txns } = await service
    .from('transactions')
    .select('establishment_id, amount, currency, metadata')
    .eq('status', 'succeeded')
    .gte('succeeded_at', start.toISOString())
    .lt('succeeded_at', end.toISOString())
    .limit(20000);

  const byEst = new Map<string, { total: number; count: number; currency: string }>();
  for (const row of txns ?? []) {
    if (!row.establishment_id) continue;
    const cur = byEst.get(row.establishment_id) ?? { total: 0, count: 0, currency: row.currency || 'EUR' };
    // The tip, not the gross charge: the service fee is not the salon's money.
    cur.total += tipAmountOf(row);
    cur.count += 1;
    byEst.set(row.establishment_id, cur);
  }

  if (dryRun) { t.considered = byEst.size; return t; }
  if (byEst.size === 0) return t;

  const { data: ests } = await service
    .from('establishments')
    .select('id, name, group_id')
    .in('id', [...byEst.keys()])
    .is('deleted_at', null);

  const byGroup = new Map<string, Array<{ name: string; total: number; count: number; currency: string }>>();
  for (const e of ests ?? []) {
    const sums = byEst.get(e.id);
    if (!e.group_id || !sums) continue;
    const list = byGroup.get(e.group_id) ?? [];
    list.push({ name: e.name ?? '', ...sums });
    byGroup.set(e.group_id, list);
  }
  const periodBucket = isoWeekBucket(start);

  for (const [groupId, list] of byGroup) {
    t.considered++;
    try {
      const recipient = await resolveGroupAdmin(service, groupId);
      if (!recipient) { t.skipped++; continue; }
      list.sort((a, b) => b.total - a.total);

      const r = await dispatchLifecycleEmail(service, {
        def: LIFECYCLE.weekly_tip_recap,
        groupId,
        to: recipient.email,
        locale: recipient.locale,
        periodBucket,
        send: () => sendWeeklyTipRecap({
          to: recipient.email,
          locale: recipient.locale,
          firstName: firstNameFrom(recipient.name),
          weekLabel: weekLabel(start, end, recipient.locale),
          establishments: list,
          currency: list[0].currency,
          dashboardUrl: `${getBaseUrl()}/dashboard`,
          unsubscribeUrl: lifecycleUnsubUrl('group_admin', groupId),
        }),
      });
      t[r]++;
    } catch (e) {
      t.failed++;
      console.error('[lifecycle] weekly recap failed', groupId, e);
    }
  }
  return t;
}


// ─── Group admin: staff profiles with no email (day 3, again 30 days later) ──
// These profiles have user_id NULL: no invite was sent, no account exists, and
// resolveStaffRecipient() cannot reach them, so no staff-audience sequence
// ever will. The admin is the only reachable party. Twice at most: after that
// the admin has decided, and repeating it every month was nagging.
const MISSING_EMAIL_MAX_SENDS = 2;
const MISSING_EMAIL_GAP_DAYS = 30;

async function runStaffMissingEmailNudges(service: Db, dryRun: boolean): Promise<Tally> {
  const t = newTally();
  const now = Date.now();
  const { data: groups } = await service
    .from('groups')
    .select('id')
    .not('onboarding_completed_at', 'is', null)
    .is('deleted_at', null)
    .limit(LIMIT);

  if (dryRun) { t.considered = (groups ?? []).length; return t; }

  for (const g of groups ?? []) {
    try {
      const { data: ests } = await service
        .from('establishments')
        .select('id, name')
        .eq('group_id', g.id)
        .is('deleted_at', null);
      const estIds = (ests ?? []).map((e) => e.id);
      if (estIds.length === 0) continue;

      const { data: orphans } = await service
        .from('staff_profiles')
        .select('id')
        .in('establishment_id', estIds)
        .is('user_id', null)
        .eq('is_active', false)
        .is('deleted_at', null)
        .lt('created_at', new Date(now - 3 * DAY).toISOString());

      const count = (orphans ?? []).length;
      if (count === 0) continue;
      t.considered++;

      const history = await sendHistory(service, LIFECYCLE.staff_missing_email.key, { groupId: g.id });
      if (history.count >= MISSING_EMAIL_MAX_SENDS) { t.skipped++; continue; }
      if (history.lastSentAt && now - history.lastSentAt.getTime() < MISSING_EMAIL_GAP_DAYS * DAY) { t.skipped++; continue; }

      const recipient = await resolveGroupAdmin(service, g.id);
      if (!recipient) { t.skipped++; continue; }

      const r = await dispatchLifecycleEmail(service, {
        def: LIFECYCLE.staff_missing_email,
        groupId: g.id,
        to: recipient.email,
        locale: recipient.locale,
        occurrenceSalt: `n${history.count + 1}`,
        send: () => sendStaffMissingEmailNudge({
          to: recipient.email,
          locale: recipient.locale,
          firstName: firstNameFrom(recipient.name),
          establishmentName: ests?.[0]?.name ?? '',
          count,
          staffUrl: `${getBaseUrl()}/dashboard/staff`,
          unsubscribeUrl: lifecycleUnsubUrl('group_admin', g.id),
        }),
      });
      t[r]++;
    } catch (e) {
      t.failed++;
      console.error('[lifecycle] staff missing-email nudge failed', g.id, e);
    }
  }
  return t;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';
  const service = createServiceClient() as unknown as Db;
  const results: Record<string, Tally> = {};

  // Priority order: conversion-critical sequences first so the per-recipient
  // frequency cap gives the slot to the most important email.
  results.groupOnboarding = await runGroupOnboardingNudges(service, dryRun);
  results.staffInvite = await runStaffInviteReminders(service, dryRun);
  results.staffMissingEmail = await runStaffMissingEmailNudges(service, dryRun);
  const ta = await runTeamAndActivationNudges(service, dryRun);
  results.inviteTeam = ta.team;
  results.activation = ta.activation;
  results.reEngagement = await runReEngagementNudges(service, dryRun);
  // Transactional, so it is not subject to the frequency cap and its position
  // here costs nothing to the sequences above it.
  results.trialEnding = await runTrialEndingWarnings(service, dryRun);
  results.freeTrialEnding = await runFreeTrialEndingWarnings(service, dryRun);
  if (new Date().getUTCDay() === 1) {
    results.weeklyRecap = await runWeeklyRecap(service, dryRun);
  }

  // Piggyback: resume any stalled OSM import jobs. Hobby plan limits us to
  // daily crons, so daily cron handlers each fire this as a side-effect to
  // give us multiple recovery checkpoints per day without burning slots.
  let importResumed = 0;
  if (!dryRun) {
    try {
      const { resumeStalledImportJobs } = await import('@/lib/admin/import-jobs');
      const r = await resumeStalledImportJobs();
      importResumed = r.resumed;
    } catch { /* never let a stale-job sweep break lifecycle-emails */ }
  }

  return NextResponse.json({ ok: true, dryRun, results, importResumed });
}

// Vercel cron issues GET; allow POST for parity with the other cron routes.
export const POST = GET;
