import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { hasPro } from '@/lib/billing/entitlements';
import {
  buildPayrollJournal,
  buildPayrollSummary,
  journalCsv,
  monthPeriod,
  summaryCsv,
} from '@/lib/export/payroll';

export const runtime = 'nodejs';

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Payroll statement for the signed-in admin's group.
 *
 * `scope=summary` (default) is one line per employee — the file that goes to
 * the accountant. `scope=journal` is one line per tip, for reconciling that
 * summary against the bank statement.
 *
 * The money itself reached the establishment's account when each tip was paid;
 * these figures record who earned it, which is what payroll needs.
 *
 * Free plans export the current month only. Past months, the journal and the
 * automatic monthly delivery are the Pro offer — the value of this export is
 * that it removes a recurring chore, and a chore you still do by hand for last
 * month is not removed.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('group_id')
    .in('role', ['group_admin', 'super_admin'])
    .eq('user_id', user.id)
    .not('group_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!roleRow?.group_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const pro = await hasPro(service, roleRow.group_id);

  const rawMonth = req.nextUrl.searchParams.get('month');
  const requested = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : currentMonth();
  const month = pro ? requested : currentMonth();

  const scope = pro && req.nextUrl.searchParams.get('scope') === 'journal' ? 'journal' : 'summary';
  const period = monthPeriod(month);

  const csv = scope === 'journal'
    ? journalCsv(await buildPayrollJournal(service, roleRow.group_id, period))
    : summaryCsv(await buildPayrollSummary(service, roleRow.group_id, period));

  const filename = scope === 'journal'
    ? `journal-pourboires-${month}.csv`
    : `releve-pourboires-${month}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
