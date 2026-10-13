import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  DEFAULT_PAYROLL_CODE,
  buildPayrollSummary,
  currentMonth,
  missingPayrollIds,
  monthPeriod,
  normalizePayrollCode,
} from '@/lib/export/payroll';
import { PayrollCodeForm } from './PayrollCodeForm';
import { MonthPicker } from './MonthPicker';
import { PageHeader } from '@/components/dashboard/ui';

export const dynamic = 'force-dynamic';

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius)',
};

function isValidMonth(m: string | undefined): m is string {
  return !!m && /^\d{4}-\d{2}$/.test(m);
}
function recentMonths(n: number): string[] {
  const out: string[] = [];
  const [y, m] = currentMonth().split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  for (let i = 0; i < n; i++) {
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

type Row = { staffId: string; name: string; count: number; amount: number };

export default async function StatementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('dashboard.statements');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('group_id')
    .in('role', ['group_admin', 'super_admin'])
    .eq('user_id', user.id)
    .not('group_id', 'is', null)
    .limit(1)
    .maybeSingle();

  const month = isValidMonth(sp.month) ? sp.month : currentMonth();
  // The same Paris-midnight bounds as the CSV, so the screen and the file
  // never disagree about which month a tip near midnight belongs to.
  const { start, end } = monthPeriod(month);
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';
  const fmtMonth = (ym: string) =>
    new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${ym}-01T00:00:00Z`));
  const fmt = new Intl.NumberFormat(intl, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

  let rows: Row[] = [];
  let missing: { staffId: string; name: string }[] = [];
  let accountantEmail: string | null = null;
  let payrollCode = DEFAULT_PAYROLL_CODE;
  if (roleRow?.group_id) {
    const service = createServiceClient();
    const { data: group } = await service
      .from('groups')
      .select('accountant_email, settings')
      .eq('id', roleRow.group_id)
      .maybeSingle();
    accountantEmail = group?.accountant_email ?? null;
    payrollCode = normalizePayrollCode((group?.settings as Record<string, unknown> | null)?.payroll_code);

    // The same builder as the CSV, so the screen and the files never disagree
    // about a figure. It reads tip_allocations: the money reached the
    // establishment's account in one lump, this is the record of who earned it.
    const data = await buildPayrollSummary(service, roleRow.group_id, { start, end, label: month });
    rows = data.summary.map((r) => ({ staffId: r.staffId, name: r.name || '—', count: r.count, amount: r.amountCents }));
    missing = missingPayrollIds(data).map((r) => ({ staffId: r.staffId, name: r.name || '—' }));
  }

  const totals = rows.reduce((acc, r) => ({ count: acc.count + r.count, amount: acc.amount + r.amount }), { count: 0, amount: 0 });

  const monthOpts = recentMonths(12).map((m) => ({ value: m, label: fmtMonth(m) }));

  const th: React.CSSProperties = {
    padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'var(--surface-2)',
  };
  const cell: React.CSSProperties = { padding: '14px', color: 'var(--text-2)' };

  const actionBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minHeight: 44, padding: '0 18px', borderRadius: 'var(--radius)',
    fontSize: 14, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
  };
  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader title={t('title')} subtitle={t('subtitle')} style={{ marginBottom: 18 }} />

      {/* Controls — wrap and go full-width on small screens */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <MonthPicker value={month} months={monthOpts} label={t('month')} />
        </div>
        <a
          className="btn-accent"
          href={`/api/statements/export.csv?month=${month}`}
          style={{ ...actionBase, background: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          {t('export')}
        </a>
        <a
          className="btn-ghost"
          href={`/api/statements/export.csv?month=${month}&scope=journal`}
          style={{ ...actionBase, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
        >
          {t('exportJournal')}
        </a>
        <a
          className="btn-ghost"
          href={`/api/statements/export.csv?month=${month}&scope=import`}
          style={{ ...actionBase, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
        >
          {t('exportImport')}
        </a>
      </div>

      {/* The payroll-software file only works with a matricule per person and
          the code of the tips pay item in that software; both are set here or
          one click away, and anyone the file would leave out is named. */}
      {roleRow?.group_id && (
        <div style={{ ...card, padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{t('importTitle')}</div>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 12 }}>{t('importBody')}</p>
          <PayrollCodeForm groupId={roleRow.group_id} initial={payrollCode} />
          {missing.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--warning)', lineHeight: 1.6 }}>
              {t('missing', { count: missing.length })}{' '}
              {missing.map((m, i) => (
                <span key={m.staffId}>
                  {i > 0 && ', '}
                  <Link href={`/dashboard/staff/${m.staffId}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{m.name}</Link>
                </span>
              ))}
              {' '}({t('missingCta')})
            </div>
          )}
        </div>
      )}

      {/* What used to be the Pro pitch on this page is now a plain fact about
          the free plan, with the one setting it depends on. A manager who has
          not entered the accountant's address learns here that one field
          would stop them ever exporting by hand again. */}
      <div style={{
        ...card, padding: '14px 16px', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ flex: '1 1 260px', minWidth: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
          {accountantEmail
            ? t('autoBodyAccountant', { email: accountantEmail })
            : t('autoBodyNoAccountant')}
        </div>
        {!accountantEmail && (
          <Link href="/dashboard/settings" className="btn-ghost" style={{
            ...actionBase, minHeight: 36, padding: '0 14px', fontSize: 13,
            background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)',
          }}>
            {t('autoCta')}
          </Link>
        )}
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={th}>{t('colEmployee')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('colCount')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('colAmount')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={3} style={{ padding: '44px 16px', textAlign: 'center', color: 'var(--text-3)' }}>{t('empty')}</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.staffId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ ...cell, fontWeight: 600, color: 'var(--text)' }}>{r.name}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{r.count}</td>
                  <td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{fmt.format(r.amount / 100)}</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr style={{ background: 'var(--surface-2)' }}>
                  <td style={{ ...cell, fontWeight: 700, color: 'var(--text)' }}>{t('total')}</td>
                  <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{totals.count}</td>
                  <td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{fmt.format(totals.amount / 100)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
