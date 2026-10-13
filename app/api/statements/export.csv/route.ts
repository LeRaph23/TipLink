import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  buildPayrollJournal,
  buildPayrollSummary,
  currentMonth,
  journalCsv,
  monthPeriod,
  normalizePayrollCode,
  payrollImportCsv,
  summaryCsv,
} from '@/lib/export/payroll';

export const runtime = 'nodejs';

/**
 * Payroll statement for the signed-in admin's group.
 *
 * `scope=summary` (default) is one line per employee — the file that goes to
 * the accountant. `scope=journal` is one line per tip, for reconciling that
 * summary against the bank statement. `scope=import` is the same totals as a
 * matricule;rubrique;montant file for the payroll software's import.
 *
 * The money itself reached the establishment's account when each tip was paid;
 * these figures record who earned it, which is what payroll needs.
 *
 * Free on every plan, every month, both files. It used to export only the
 * current month on the free plan, which sounds generous and is not: payroll
 * is done for the month that just ended, so on the 3rd the only month a free
 * plan could download was the empty one. The manager's own figures are not
 * something to sell back to them.
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

  const rawMonth = req.nextUrl.searchParams.get('month');
  const month = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : currentMonth();
  const rawScope = req.nextUrl.searchParams.get('scope');
  const scope = rawScope === 'journal' || rawScope === 'import' ? rawScope : 'summary';

  const period = monthPeriod(month);

  let csv: string;
  if (scope === 'journal') {
    csv = journalCsv(await buildPayrollJournal(service, roleRow.group_id, period));
  } else if (scope === 'import') {
    const { data: group } = await service
      .from('groups').select('settings').eq('id', roleRow.group_id).maybeSingle();
    const code = normalizePayrollCode((group?.settings as Record<string, unknown> | null)?.payroll_code);
    csv = payrollImportCsv(await buildPayrollSummary(service, roleRow.group_id, period), code);
  } else {
    csv = summaryCsv(await buildPayrollSummary(service, roleRow.group_id, period));
  }

  const filename = {
    journal: `journal-pourboires-${month}.csv`,
    import: `import-paie-pourboires-${month}.csv`,
    summary: `releve-pourboires-${month}.csv`,
  }[scope];

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
