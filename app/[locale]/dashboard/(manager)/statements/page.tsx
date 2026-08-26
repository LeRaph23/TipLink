import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { hasPro } from '@/lib/billing/entitlements';
import { ProUpsell } from '@/components/billing/ProUpsell';
import { MonthPicker } from './MonthPicker';

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
  const tPro = await getTranslations('dashboard.pro');

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
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';
  const fmtMonth = (ym: string) =>
    new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${ym}-01T00:00:00Z`));
  const fmt = new Intl.NumberFormat(intl, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

  const rows: Row[] = [];
  const isPro = roleRow?.group_id ? await hasPro(createServiceClient(), roleRow.group_id) : false;
  if (roleRow?.group_id) {
    const service = createServiceClient();
    const { data: ests } = await service
      .from('establishments').select('id').eq('group_id', roleRow.group_id).is('deleted_at', null);
    const estIds = (ests ?? []).map((e) => e.id);

    if (estIds.length > 0) {
      const { data: staff } = await service
        .from('staff_profiles').select('id, full_name').in('establishment_id', estIds).is('deleted_at', null);
      const byId = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
      const staffIds = [...byId.keys()];

      if (staffIds.length > 0) {
        // Statement figures = tips attributed to each employee in the month.
        // The money itself reached the establishment's account at the same
        // moment; this is the record of who earned it, for payroll.
        const { data: allocated } = await service
          .from('tip_allocations')
          .select('amount, staff_id')
          .in('staff_id', staffIds)
          .eq('status', 'allocated')
          .gte('allocated_at', start)
          .lt('allocated_at', end);

        const agg = new Map<string, Row>();
        for (const a of (allocated ?? []) as Array<{ amount: number; staff_id: string }>) {
          const r = agg.get(a.staff_id) ?? { staffId: a.staff_id, name: byId.get(a.staff_id) ?? '—', count: 0, amount: 0 };
          r.count += 1;
          r.amount += a.amount;
          agg.set(a.staff_id, r);
        }
        rows.push(...[...agg.values()].sort((a, b) => b.amount - a.amount));
      }
    }
  }

  const totals = rows.reduce((acc, r) => ({ count: acc.count + r.count, amount: acc.amount + r.amount }), { count: 0, amount: 0 });
  const monthOpts = recentMonths(12).map((m) => ({ value: m, label: fmtMonth(m) }));

  const th: React.CSSProperties = {
    padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'var(--surface-2)',
  };
  const cell: React.CSSProperties = { padding: '14px', color: 'var(--text-2)' };

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>{t('title')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.5 }}>{t('subtitle')}</p>
      </div>

      {/* Controls — wrap and go full-width on small screens */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <MonthPicker value={month} months={monthOpts} label={t('month')} />
        </div>
        <a href={`/api/statements/export.csv?month=${month}`} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 44, padding: '0 18px', borderRadius: 'var(--radius)',
          background: 'var(--accent)', color: 'var(--accent-fg)', fontSize: 14,
          fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
        }}>{t('export')}</a>
        {isPro && (
          <a href={`/api/statements/export.csv?month=${month}&scope=journal`} style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 44, padding: '0 18px', borderRadius: 'var(--radius)',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 14,
            fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
          }}>{t('exportJournal')}</a>
        )}
      </div>

      {/* The free plan exports the current month only. This used to be a grey
          sentence stating the limit with nothing to click — a manager who had
          just picked an older month learned they could not have it and was left
          there. It is the highest-intent moment in the product, so it carries a
          way out now. */}
      {!isPro && (
        <ProUpsell
          title={tPro('exportTitle')}
          body={tPro('exportBody')}
          cta={tPro('exportCta')}
          emphasis="quiet"
        />
      )}

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
