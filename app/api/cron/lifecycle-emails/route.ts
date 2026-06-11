import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
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
  dayWindowBucket,
} from '@/lib/email/lifecycle';
import {
  sendGroupOnboardingNudge,
  sendTagDeliveredPlaceNudge,
  sendInviteTeamNudge,
  sendActivationNudge,
  sendStaffInviteReminder,
  sendStaffBankingNudge,
  sendUnclaimedTipsReminder,
  sendReEngagementEmail,
  sendWeeklyTipRecap,
} from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DAY = 86400000;
const LIMIT = 300;

type Tally = { considered: number; sent: number; skipped: number; failed: number };
const newTally = (): Tally => ({ considered: 0, sent: 0, skipped: 0, failed: 0 });

// The lifecycle queries touch columns not present in the generated DB types.
type Db = SupabaseClient;

// ─── Group admin: onboarding not completed (J+2 step 1, J+5 step 2) ──────────
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
      const { count } = await service
        .from('smarttag_orders')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', g.id);
      if (!count) { t.skipped++; continue; }

      const recipient = await resolveGroupAdmin(service, g.id);
      if (!recipient) { t.skipped++; continue; }

      const ageDays = (now - new Date(g.created_at).getTime()) / DAY;
      const step: 1 | 2 = ageDays >= 5 ? 2 : 1;
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
          firstName: firstNameFrom(recipient.name, 'Bonjour'),
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
async function runTagDeliveredNudges(service: Db, dryRun: boolean): Promise<Tally> {
  const t = newTally();
  const now = Date.now();
  const { data: orders } = await service
    .from('smarttag_orders')
    .select('group_id, delivered_at')
    .eq('status', 'delivered')
    .lt('delivered_at', new Date(now - 1 * DAY).toISOString())
    .gt('delivered_at', new Date(now - 21 * DAY).toISOString())
    .limit(LIMIT);

  if (dryRun) { t.considered = (orders ?? []).length; return t; }

  // Preload establishments + which ones already have a succeeded tip, once.
  const groupIds = [...new Set((orders ?? []).map((o) => o.group_id).filter((x): x is string => !!x))];
  const estByGroup = await establishmentsByGroup(service, groupIds);
  const tipped = await establishmentsWithSucceededTip(
    service,
    [...estByGroup.values()].flat().map((e) => e.id),
  );

  for (const groupId of groupIds) {
    t.considered++;
    try {
      const ests = estByGroup.get(groupId) ?? [];
      if (ests.some((e) => tipped.has(e.id))) { t.skipped++; continue; }

      const recipient = await resolveGroupAdmin(service, groupId);
      if (!recipient) { t.skipped++; continue; }
      const unsub = lifecycleUnsubUrl('group_admin', groupId);

      const r = await dispatchLifecycleEmail(service, {
        def: LIFECYCLE.tag_delivered_place,
        groupId: groupId,
        establishmentId: ests[0]?.id ?? null,
        to: recipient.email,
        locale: recipient.locale,
        send: () => sendTagDeliveredPlaceNudge({
          to: recipient.email,
          firstName: firstNameFrom(recipient.name, 'Bonjour'),
          establishmentName: ests[0]?.name ?? 'votre salon',
          dashboardUrl: `${getBaseUrl()}/dashboard`,
          unsubscribeUrl: unsub,
        }),
      });
      t[r]++;
    } catch (e) {
      t.failed++;
      console.error('[lifecycle] tag delivered nudge failed', groupId, e);
    }
  }
  return t;
}

// ─── Group admin: onboarded but no team / no tips ────────────────────────────
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

  // Preload establishments, succeeded-tip set, and staff counts for every group
  // in this batch (was an N+1 of 3 lookups per group inside the loop).
  const groupIds = (groups ?? []).map((g) => g.id);
  const estByGroup = await establishmentsByGroup(service, groupIds);
  const allEstIds = [...estByGroup.values()].flat().map((e) => e.id);
  const tipped = await establishmentsWithSucceededTip(service, allEstIds);
  const staffByEst = new Map<string, number>();
  if (allEstIds.length > 0) {
    const { data: staffRows } = await service
      .from('staff_profiles')
      .select('establishment_id')
      .in('establishment_id', allEstIds)
      .is('deleted_at', null);
    for (const s of (staffRows ?? []) as Array<{ establishment_id: string | null }>) {
      if (s.establishment_id) staffByEst.set(s.establishment_id, (staffByEst.get(s.establishment_id) ?? 0) + 1);
    }
  }

  for (const g of groups ?? []) {
    try {
      const ests = estByGroup.get(g.id) ?? [];
      const estIds = ests.map((e) => e.id);
      const recipient = await resolveGroupAdmin(service, g.id);
      if (!recipient) continue;
      const unsub = lifecycleUnsubUrl('group_admin', g.id);
      const firstName = firstNameFrom(recipient.name, 'Bonjour');
      const estName = ests[0]?.name ?? 'votre salon';

      // Invite-team nudge: establishment has at most one staff member.
      const staffCount = estIds.reduce((sum, id) => sum + (staffByEst.get(id) ?? 0), 0);
      if (staffCount <= 1) {
        team.considered++;
        const r = await dispatchLifecycleEmail(service, {
          def: LIFECYCLE.invite_team,
          groupId: g.id,
          establishmentId: ests[0]?.id ?? null,
          to: recipient.email,
          locale: recipient.locale,
          send: () => sendInviteTeamNudge({
            to: recipient.email, firstName, establishmentName: estName,
            inviteUrl: `${getBaseUrl()}/dashboard/staff`, unsubscribeUrl: unsub,
          }),
        });
        team[r]++;
      }

      // Activation nudge: 7+ days onboarded and still zero succeeded tips.
      const daysSince = Math.floor((now - new Date(g.onboarding_completed_at).getTime()) / DAY);
      const hasTip = estIds.some((id) => tipped.has(id));
      if (daysSince >= 7 && !hasTip) {
        activation.considered++;
        const r = await dispatchLifecycleEmail(service, {
          def: LIFECYCLE.activation_no_tips,
          groupId: g.id,
          establishmentId: ests[0]?.id ?? null,
          to: recipient.email,
          locale: recipient.locale,
          send: () => sendActivationNudge({
            to: recipient.email, firstName, establishmentName: estName,
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
        (s.establishments as { name?: string } | null)?.name ?? 'votre établissement';
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
          firstName: firstNameFrom(recipient.fullName, 'Bonjour'),
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

// ─── Staff: account claimed, Stripe banking not started (J+1/3/7) ────────────
async function runStaffBankingNudges(service: Db, dryRun: boolean): Promise<Tally> {
  const t = newTally();
  const now = Date.now();
  const { data: staff } = await service
    .from('staff_profiles')
    .select('id, created_at, establishment_id')
    .eq('is_active', true)
    .eq('onboarding_status', 'not_started')
    .is('deleted_at', null)
    .lt('created_at', new Date(now - 1 * DAY).toISOString())
    .gt('created_at', new Date(now - 30 * DAY).toISOString())
    .limit(LIMIT);

  if (dryRun) { t.considered = (staff ?? []).length; return t; }

  for (const s of staff ?? []) {
    t.considered++;
    try {
      const recipient = await resolveStaffRecipient(service, s.id);
      if (!recipient) { t.skipped++; continue; }
      const ageDays = (now - new Date(s.created_at).getTime()) / DAY;
      const step: 1 | 2 | 3 = ageDays >= 7 ? 3 : ageDays >= 3 ? 2 : 1;
      const unsub = lifecycleUnsubUrl('staff', s.id);

      const r = await dispatchLifecycleEmail(service, {
        def: LIFECYCLE.staff_banking_nudge,
        staffId: s.id,
        establishmentId: s.establishment_id,
        to: recipient.email,
        locale: recipient.locale,
        occurrenceSalt: `step${step}`,
        send: () => sendStaffBankingNudge({
          to: recipient.email,
          firstName: firstNameFrom(recipient.fullName, 'Bonjour'),
          bankingUrl: `${getBaseUrl()}/dashboard/banking`,
          step,
          unsubscribeUrl: unsub,
        }),
      });
      t[r]++;
    } catch (e) {
      t.failed++;
      console.error('[lifecycle] staff banking nudge failed', s.id, e);
    }
  }
  return t;
}

// ─── Staff: tips captured but HELD (not onboarded) — J+7/30/60, before the
//     90-day auto-refund. Driven by the age of the OLDEST held tip. ───────────
async function runUnclaimedTipsReminders(service: Db, dryRun: boolean): Promise<Tally> {
  const t = newTally();
  const now = Date.now();

  const { data: rows } = await service
    .from('group_tip_transfers')
    .select('staff_id, amount, created_at, staff_profiles!inner(onboarding_status)')
    .eq('status', 'pending')
    .lt('created_at', new Date(now - 7 * DAY).toISOString())
    .limit(5000);

  type Held = { total: number; oldest: number; onboarded: boolean };
  const byStaff = new Map<string, Held>();
  for (const r of (rows ?? []) as unknown as Array<{ staff_id: string; amount: number; created_at: string; staff_profiles: { onboarding_status: string } | null }>) {
    const ts = new Date(r.created_at).getTime();
    const cur = byStaff.get(r.staff_id) ?? { total: 0, oldest: ts, onboarded: r.staff_profiles?.onboarding_status === 'complete' };
    cur.total += r.amount;
    cur.oldest = Math.min(cur.oldest, ts);
    byStaff.set(r.staff_id, cur);
  }

  if (dryRun) { t.considered = byStaff.size; return t; }

  for (const [staffId, held] of byStaff) {
    t.considered++;
    // Onboarded staff are paid out automatically — no reminder needed.
    if (held.onboarded || held.total <= 0) { t.skipped++; continue; }
    try {
      const recipient = await resolveStaffRecipient(service, staffId);
      if (!recipient) { t.skipped++; continue; }
      const ageDays = (now - held.oldest) / DAY;
      const step: 1 | 2 | 3 = ageDays >= 60 ? 3 : ageDays >= 30 ? 2 : 1;
      const amount = new Intl.NumberFormat(recipient.locale === 'en' ? 'en-US' : 'fr-FR', {
        style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
      }).format(held.total / 100);
      const unsub = lifecycleUnsubUrl('staff', staffId);

      const r = await dispatchLifecycleEmail(service, {
        def: LIFECYCLE.staff_unclaimed_tips,
        staffId,
        to: recipient.email,
        locale: recipient.locale,
        occurrenceSalt: `step${step}`,
        send: () => sendUnclaimedTipsReminder({
          to: recipient.email,
          firstName: firstNameFrom(recipient.fullName, 'Bonjour'),
          amount,
          bankingUrl: `${getBaseUrl()}/dashboard/banking`,
          step,
          unsubscribeUrl: unsub,
        }),
      });
      t[r]++;
    } catch (e) {
      t.failed++;
      console.error('[lifecycle] unclaimed tips reminder failed', staffId, e);
    }
  }
  return t;
}

// ─── Group admin: establishment was active then went quiet (recurring) ───────
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

  // Most recent succeeded tip per establishment within the 60-day window.
  const latest = new Map<string, string>();
  for (const row of txns ?? []) {
    if (row.establishment_id && !latest.has(row.establishment_id)) {
      latest.set(row.establishment_id, row.succeeded_at);
    }
  }
  const quietCutoff = now - 21 * DAY;
  const candidates = [...latest.entries()]
    .filter(([, ts]) => new Date(ts).getTime() < quietCutoff)
    .map(([id, ts]) => ({ id, ts }));

  if (dryRun) { t.considered = candidates.length; return t; }
  if (candidates.length === 0) return t;

  const { data: ests } = await service
    .from('establishments')
    .select('id, name, group_id')
    .in('id', candidates.map((c) => c.id))
    .is('deleted_at', null);
  const estById = new Map((ests ?? []).map((e) => [e.id, e]));
  const periodBucket = dayWindowBucket(new Date(), 30);

  for (const c of candidates) {
    const est = estById.get(c.id);
    if (!est?.group_id) continue;
    t.considered++;
    try {
      const recipient = await resolveGroupAdmin(service, est.group_id);
      if (!recipient) { t.skipped++; continue; }
      const daysQuiet = Math.floor((now - new Date(c.ts).getTime()) / DAY);
      const unsub = lifecycleUnsubUrl('group_admin', est.group_id);

      const r = await dispatchLifecycleEmail(service, {
        def: LIFECYCLE.re_engagement,
        groupId: est.group_id,
        establishmentId: est.id,
        to: recipient.email,
        locale: recipient.locale,
        periodBucket,
        send: () => sendReEngagementEmail({
          to: recipient.email,
          firstName: firstNameFrom(recipient.name, 'Bonjour'),
          establishmentName: est.name ?? 'votre salon',
          daysQuiet,
          dashboardUrl: `${getBaseUrl()}/dashboard`,
          unsubscribeUrl: unsub,
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

// ─── Group admin: weekly recap of tips collected (Mondays) ───────────────────
async function runWeeklyRecap(service: Db, dryRun: boolean): Promise<Tally> {
  const t = newTally();
  const now = Date.now();
  const { data: txns } = await service
    .from('transactions')
    .select('establishment_id, amount, currency')
    .eq('status', 'succeeded')
    .gte('succeeded_at', new Date(now - 7 * DAY).toISOString())
    .limit(20000);

  const agg = new Map<string, { total: number; count: number; currency: string }>();
  for (const row of txns ?? []) {
    if (!row.establishment_id) continue;
    const cur = agg.get(row.establishment_id) ?? { total: 0, count: 0, currency: row.currency || 'EUR' };
    cur.total += row.amount ?? 0;
    cur.count += 1;
    agg.set(row.establishment_id, cur);
  }

  if (dryRun) { t.considered = agg.size; return t; }
  if (agg.size === 0) return t;

  const { data: ests } = await service
    .from('establishments')
    .select('id, name, group_id')
    .in('id', [...agg.keys()])
    .is('deleted_at', null);
  const estById = new Map((ests ?? []).map((e) => [e.id, e]));
  const periodBucket = isoWeekBucket(new Date());

  for (const [estId, sums] of agg) {
    const est = estById.get(estId);
    if (!est?.group_id) continue;
    t.considered++;
    try {
      const recipient = await resolveGroupAdmin(service, est.group_id);
      if (!recipient) { t.skipped++; continue; }
      const unsub = lifecycleUnsubUrl('group_admin', est.group_id);

      const r = await dispatchLifecycleEmail(service, {
        def: LIFECYCLE.weekly_tip_recap,
        groupId: est.group_id,
        establishmentId: est.id,
        to: recipient.email,
        locale: recipient.locale,
        periodBucket,
        send: () => sendWeeklyTipRecap({
          to: recipient.email,
          firstName: firstNameFrom(recipient.name, 'Bonjour'),
          establishmentName: est.name ?? 'votre salon',
          weekTotal: sums.total,
          tipCount: sums.count,
          currency: sums.currency,
          dashboardUrl: `${getBaseUrl()}/dashboard`,
          unsubscribeUrl: unsub,
        }),
      });
      t[r]++;
    } catch (e) {
      t.failed++;
      console.error('[lifecycle] weekly recap failed', estId, e);
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
  results.staffBanking = await runStaffBankingNudges(service, dryRun);
  results.unclaimedTips = await runUnclaimedTipsReminders(service, dryRun);
  results.staffInvite = await runStaffInviteReminders(service, dryRun);
  results.tagDelivered = await runTagDeliveredNudges(service, dryRun);
  const ta = await runTeamAndActivationNudges(service, dryRun);
  results.inviteTeam = ta.team;
  results.activation = ta.activation;
  results.reEngagement = await runReEngagementNudges(service, dryRun);
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
