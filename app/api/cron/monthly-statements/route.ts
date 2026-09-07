import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isAuthorizedCronRequest } from '@/lib/auth/require-cron';
import { sendMonthlyStatement, sendFreeMonthlyRecap } from '@/lib/email';
import {
  LIFECYCLE,
  dispatchLifecycleEmail,
  resolveGroupAdmin,
  firstNameFrom,
  lifecycleUnsubUrl,
} from '@/lib/email/lifecycle';
import { getBaseUrl } from '@/lib/env';
import {
  buildPayrollJournal,
  buildPayrollSummary,
  journalCsv,
  monthPeriod,
  previousMonth,
  summaryCsv,
} from '@/lib/export/payroll';

export const runtime = 'nodejs';

const LIMIT = 200;

/**
 * Sends last month's payroll statement to every Pro group, and to their
 * accountant when one is configured. Free groups that took tips get the same
 * month without the attachments, plus what the free plan cost them.
 *
 * This is the Pro feature, not a convenience on top of it: an export the
 * manager has to remember to run is still a chore, and the whole pitch is that
 * it stops being one.
 *
 * Scheduled for the 5th so the month is unambiguously closed. Delivery is
 * logged in `lifecycle_email_log` with a per-group, per-month dedup key, so a
 * retry or a double cron fire cannot mail the same statement twice.
 */
export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const month = previousMonth();
  const period = monthPeriod(month);

  const { data: groups } = await service
    .from('groups')
    .select('id, name, accountant_email')
    .eq('plan', 'pro')
    .is('deleted_at', null)
    .limit(LIMIT);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const group of groups ?? []) {
    const dedupKey = `monthly_statement:${group.id}:${month}`;
    try {
      const { data: already } = await service
        .from('lifecycle_email_log')
        .select('id')
        .eq('dedup_key', dedupKey)
        .maybeSingle();
      if (already) {
        skipped++;
        continue;
      }

      const dataset = await buildPayrollSummary(service, group.id, period);
      // Nothing was earned — sending an empty statement is noise, not service.
      if (dataset.summary.length === 0) {
        skipped++;
        continue;
      }

      const recipients = new Set<string>();
      const { data: adminRole } = await service
        .from('user_roles')
        .select('user_id')
        .eq('group_id', group.id)
        .eq('role', 'group_admin')
        .limit(1)
        .maybeSingle();
      if (adminRole?.user_id) {
        const { data } = await service.auth.admin.getUserById(adminRole.user_id);
        if (data.user?.email) recipients.add(data.user.email);
      }
      if (group.accountant_email) recipients.add(group.accountant_email);

      if (recipients.size === 0) {
        skipped++;
        continue;
      }

      const journal = await buildPayrollJournal(service, group.id, period);
      const monthLabel = new Intl.DateTimeFormat('fr-FR', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${month}-01T00:00:00Z`));
      const totalFormatted = new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
      }).format(dataset.totals.amountCents / 100);

      await sendMonthlyStatement({
        to: [...recipients],
        establishmentName: group.name,
        monthLabel,
        staffCount: dataset.summary.length,
        totalFormatted,
        summaryCsv: summaryCsv(dataset),
        journalCsv: journalCsv(journal),
        month,
        locale: 'fr',
      });

      // Logged after the send: a crash between the two re-sends next run, which
      // is a far better failure than silently never sending at all.
      await service.from('lifecycle_email_log').insert({
        email_key: 'monthly_statement',
        dedup_key: dedupKey,
        audience: 'group',
        to_email: [...recipients][0],
        locale: 'fr',
        status: 'sent',
        transactional: true,
        group_id: group.id,
        sent_at: new Date().toISOString(),
      } as never);

      sent++;
    } catch (err) {
      console.error('[monthly-statements] failed', { groupId: group.id, err });
      failed++;
    }
  }

  const free = await sendFreeRecaps(service, month, period);

  return NextResponse.json({ ok: true, month, sent, skipped, failed, free });
}

/**
 * The free plan's version of the same month.
 *
 * Same cron, same closed month, same `lifecycle_email_log` dedup, one email
 * more. It goes through `dispatchLifecycleEmail` rather than writing the log
 * directly the way the Pro statement does, because this one is a recap nobody
 * asked for: it has to honour the opt-out and the per-recipient frequency cap,
 * and the statement above, being something a subscriber pays for, does not.
 *
 * Only groups that actually took tips. "You collected nothing last month, buy
 * our subscription" is an argument against itself.
 */
async function sendFreeRecaps(
  service: ReturnType<typeof createServiceClient>,
  month: string,
  period: ReturnType<typeof monthPeriod>,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const tally = { sent: 0, skipped: 0, failed: 0 };

  const { data: groups } = await service
    .from('groups')
    .select('id, name')
    .neq('plan', 'pro')
    .is('deleted_at', null)
    .limit(LIMIT);

  for (const group of groups ?? []) {
    try {
      const dataset = await buildPayrollSummary(service, group.id, period);
      if (dataset.totals.count < 1) { tally.skipped++; continue; }

      const recipient = await resolveGroupAdmin(service, group.id);
      if (!recipient) { tally.skipped++; continue; }

      const monthLabel = new Intl.DateTimeFormat('fr-FR', {
        month: 'long', year: 'numeric', timeZone: 'UTC',
      }).format(new Date(`${month}-01T00:00:00Z`));
      const totalFormatted = new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
      }).format(dataset.totals.amountCents / 100);

      const r = await dispatchLifecycleEmail(service, {
        def: LIFECYCLE.monthly_recap_free,
        groupId: group.id,
        to: recipient.email,
        locale: recipient.locale,
        periodBucket: month,
        send: () => sendFreeMonthlyRecap({
          to: recipient.email,
          firstName: firstNameFrom(recipient.name, 'Bonjour'),
          establishmentName: group.name ?? 'votre établissement',
          monthLabel,
          tipCount: dataset.totals.count,
          totalFormatted,
          billingUrl: `${getBaseUrl()}/dashboard/billing`,
          unsubscribeUrl: lifecycleUnsubUrl('group_admin', group.id),
        }),
      });
      if (r === 'sent') tally.sent++;
      else if (r === 'failed') tally.failed++;
      else tally.skipped++;
    } catch (err) {
      console.error('[monthly-statements] free recap failed', { groupId: group.id, err });
      tally.failed++;
    }
  }

  return tally;
}

// Vercel cron uses GET with the same auth header.
export const GET = POST;
