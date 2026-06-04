import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius)',
};

function isValidMonth(m: string | undefined): m is string {
  return !!m && /^\d{4}-\d{2}$/.test(m);
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    end: new Date(Date.UTC(y, m, 1)).toISOString(),
  };
}

function recentMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

type Row = { staffId: string; name: string; count: number; net: number; paid: number; pending: number };

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
  const { start, end } = monthRange(month);
  const monthLabel = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
  const fmt = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
  });

  const rows: Row[] = [];
  if (roleRow?.group_id) {
    const service = createServiceClient();
    const { data: ests } = await service
      .from('establishments')
      .select('id')
      .eq('group_id', roleRow.group_id)
      .is('deleted_at', null);
    const estIds = (ests ?? []).map((e) => e.id);

    if (estIds.length > 0) {
      const { data: staff } = await service
        .from('staff_profiles')
        .select('id, full_name')
        .in('establishment_id', estIds)
        .is('deleted_at', null);
      const byId = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
      const staffIds = [...byId.keys()];

      if (staffIds.length > 0) {
        const { data: allocs } = await service
          .from('group_tip_transfers')
          .select('amount, status, staff_id, transactions!inner(succeeded_at)')
          .in('staff_id', staffIds)
          .gte('transactions.succeeded_at', start)
          .lt('transactions.succeeded_at', end);

        const agg = new Map<string, Row>();
        for (const a of (allocs ?? []) as Array<{ amount: number; status: string; staff_id: string }>) {
          // Reversed / expired allocations were refunded to the customer — they
          // are not income for the employee and must be excluded.
          if (a.status === 'reversed') continue;
          const r = agg.get(a.staff_id) ?? {
            staffId: a.staff_id, name: byId.get(a.staff_id) ?? '—', count: 0, net: 0, paid: 0, pending: 0,
          };
          r.count += 1;
          r.net += a.amount;
          if (a.status === 'succeeded') r.paid += a.amount;
          else r.pending += a.amount;
          agg.set(a.staff_id, r);
        }
        rows.push(...[...agg.values()].sort((a, b) => b.net - a.net));
      }
    }
  }

  const totals = rows.reduce(
    (acc, r) => ({ count: acc.count + r.count, net: acc.net + r.net, paid: acc.paid + r.paid, pending: acc.pending + r.pending }),
    { count: 0, net: 0, paid: 0, pending: 0 },
  );

  const th: React.CSSProperties = {
    padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'var(--surface-2)',
  };
  const tdCell: React.CSSProperties = { padding: '12px 16px', color: 'var(--text-2)', whiteSpace: 'nowrap' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>{t('title')}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{t('subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Native GET form — month picker works without client JS. */}
          <form method="get" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label htmlFor="month" style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('month')}</label>
            <select id="month" name="month" defaultValue={month} style={{
              padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)',
            }}>
              {recentMonths(12).map((m) => (
                <option key={m} value={m}>
                  {new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`))}
                </option>
              ))}
            </select>
            <button type="submit" style={{
              padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
            }}>{t('month')}</button>
          </form>
          <a href={`/api/statements/export.csv?month=${month}`} style={{
            padding: '8px 14px', borderRadius: 'var(--radius)', background: 'var(--accent)',
            color: 'var(--accent-fg)', fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
          }}>{t('export')}</a>
        </div>
      </div>

      <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>{t('colEmployee')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('colCount')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('colNet')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('colPaid')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('colPending')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-3)' }}>{t('empty')}</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.staffId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ ...tdCell, fontWeight: 600, color: 'var(--text)' }}>{r.name}</td>
                  <td style={{ ...tdCell, textAlign: 'right' }}>{r.count}</td>
                  <td style={{ ...tdCell, textAlign: 'right', fontWeight: 600, color: 'var(--text)' }}>{fmt.format(r.net / 100)}</td>
                  <td style={{ ...tdCell, textAlign: 'right', color: 'var(--success)' }}>{fmt.format(r.paid / 100)}</td>
                  <td style={{ ...tdCell, textAlign: 'right', color: r.pending > 0 ? 'var(--warning)' : 'var(--text-3)' }}>{fmt.format(r.pending / 100)}</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
                  <td style={{ ...tdCell, fontWeight: 700, color: 'var(--text)' }}>{t('total')} · {monthLabel}</td>
                  <td style={{ ...tdCell, textAlign: 'right', fontWeight: 700 }}>{totals.count}</td>
                  <td style={{ ...tdCell, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{fmt.format(totals.net / 100)}</td>
                  <td style={{ ...tdCell, textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>{fmt.format(totals.paid / 100)}</td>
                  <td style={{ ...tdCell, textAlign: 'right', fontWeight: 700, color: totals.pending > 0 ? 'var(--warning)' : 'var(--text-3)' }}>{fmt.format(totals.pending / 100)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Accountant / DSN disclaimer */}
      <div style={{ ...card, padding: '14px 16px', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
        <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{t('disclaimerTitle')}</div>
        {t('disclaimerBody')}
      </div>
    </div>
  );
}
