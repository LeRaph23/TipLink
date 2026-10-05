import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isAuthorizedCronRequest } from '@/lib/auth/require-cron';
import { sendMonthlyStatement } from '@/lib/email';
import {
  buildPayrollJournal,
  buildPayrollSummary,
  journalCsv,
  monthPeriod,
  previousMonth,
  summaryCsv,
} from '@/lib/export/payroll';

export const runtime = 'nodejs';

/** Rows per page. Pagination, not a ceiling — see `eachGroup`. */
const PAGE_SIZE = 200;

/**
 * Hard stop, so a pagination bug cannot spin for ever inside a cron.
 * 100 pages is 20 000 groups; crossing it is a real signal, not a limit to
 * raise quietly.
 */
const MAX_PAGES = 100;

/**
 * Walks every group, a page at a time.
 *
 * This used to be a bare `.limit(200)` with no ORDER BY on both the Pro and the
 * free queries. Two things followed. Past 200 groups the rest were simply never
 * processed, and the route still answered `{ ok: true }` with `failed: 0`, so
 * nothing anywhere said so. And with no ordering Postgres was free to return a
 * different arbitrary 200 each month, so a given group could be skipped
 * indefinitely rather than merely last.
 *
 * Silently not sending the statement to the 201st group, whose accountant is
 * waiting for it, is the worst shape this bug could take.
 *
 * Keyset pagination on `id` rather than `.range()`: the set is stable under
 * concurrent inserts, which matters because a group created while this runs
 * would otherwise shift every later page and drop a row.
 */
async function* eachGroup(
  service: ReturnType<typeof createServiceClient>,
): AsyncGenerator<{ id: string; name: string | null; accountant_email?: string | null }> {
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    let q = service
      .from('groups')
      .select('id, name, accountant_email')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);

    if (cursor) q = q.gt('id', cursor);

    const { data, error } = await q;
    if (error) {
      console.error('[monthly-statements] group page failed', { page, error });
      return;
    }
    if (!data?.length) return;

    for (const group of data) yield group;

    if (data.length < PAGE_SIZE) return;
    cursor = data[data.length - 1].id;

    if (page === MAX_PAGES - 1) {
      console.error('[monthly-statements] page cap reached, groups may be unprocessed', {});
    }
  }
}

/**
 * Sends last month's payroll statement to every group that took tips, and to
 * their accountant when one is configured.
 *
 * Every plan since 00088. It was the Pro feature, and free groups got a recap
 * without the files instead, telling them what the free plan had cost them.
 * A statement is the manager's own data; withholding it to sell a
 * subscription made the subscription look like a ransom.
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

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for await (const group of eachGroup(service)) {
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
        // `groups.name` is nullable; the free recap below already falls back.
        establishmentName: group.name ?? 'Votre établissement',
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

  return NextResponse.json({ ok: true, month, sent, skipped, failed });
}

// Vercel cron uses GET with the same auth header.
export const GET = POST;
