import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { CsvExportButton } from '@/components/dashboard/CsvExportButton';
import { ReceiptLink } from '@/components/dashboard/ReceiptLink';
import { PageHeader } from '@/components/dashboard/ui';

function StatusBadge({ status, label }: { status: 'allocated' | 'reversed'; label: string }) {
  const [bg, color] = status === 'allocated'
    ? ['var(--success-bg)', 'var(--success)']
    : ['var(--neutral-bg)', 'var(--neutral)'];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 600, background: bg, color, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
      {label}
    </span>
  );
}

export default async function StaffTransactionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.txs');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: staffProfile }, { data: adminRole }] = await Promise.all([
    supabase.from('staff_profiles').select('id').eq('user_id', user!.id).is('deleted_at', null).maybeSingle(),
    supabase.from('user_roles').select('group_id').eq('user_id', user!.id).eq('role', 'group_admin')
      .not('group_id', 'is', null).limit(1).maybeSingle(),
  ]);

  // Same scope as the overview: an admin who takes no tips of their own sees
  // the team's, rather than an empty list while the team is being paid.
  const teamEstablishmentIds = !staffProfile && adminRole?.group_id
    ? ((await createServiceClient()
        .from('establishments')
        .select('id')
        .eq('group_id', adminRole.group_id)
        .is('deleted_at', null)).data ?? []).map((e) => e.id)
    : [];

  // The employee's own share, from tip_allocations, like the overview and the
  // statements: `transactions.amount` is what the customer paid (tip plus the
  // service fee on top), a group tip has no staff_id on the transaction, and a
  // declined attempt is not money anyone received. Listing transactions made
  // this page disagree with every other figure in the dashboard.
  // Without a staff profile there are no tips — and filtering on an empty
  // staff_id would send '' to a UUID column (Postgres syntax error).
  const ALLOC_COLUMNS = 'amount, status, allocated_at, created_at, transaction_id, transactions!inner(currency, establishment_id)';
  const { data: allocations } = staffProfile
    ? await supabase.from('tip_allocations').select(ALLOC_COLUMNS)
        .eq('staff_id', staffProfile.id)
        .order('created_at', { ascending: false })
        .limit(100)
    : teamEstablishmentIds.length > 0
      ? await supabase.from('tip_allocations').select(ALLOC_COLUMNS)
          .in('transactions.establishment_id', teamEstablishmentIds)
          .order('created_at', { ascending: false })
          .limit(100)
      : { data: null };

  // A group tip is split into several allocations of one transaction; the key
  // must stay unique per row.
  const rows = (allocations ?? []).map((a, i) => ({
    key: `${a.transaction_id}-${i}`,
    id: a.transaction_id,
    amount: a.amount,
    currency: (a.transactions as { currency?: string } | null)?.currency ?? 'EUR',
    status: a.status === 'reversed' ? ('reversed' as const) : ('allocated' as const),
    created_at: a.allocated_at ?? a.created_at,
  }));

  const currency = rows[0]?.currency ?? 'EUR';
  const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 });
  const total = rows.filter((r) => r.status === 'allocated').reduce((sum, r) => sum + r.amount, 0);
  const statusLabel = { allocated: t('statusReceived'), reversed: t('statusReversed') };

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={
          <>
            {t('totalReceived')}: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt.format(total / 100)}</span>
          </>
        }
        action={<CsvExportButton transactions={rows.map((r) => ({ ...r, status: statusLabel[r.status] }))} />}
      />

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {[t('colReference'), t('colDate'), t('colAmount'), t('colStatus'), t('colReceipt')].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr><td colSpan={5} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-3)' }}>{t('empty')}</td></tr>
              ) : rows.map(tx => (
                <tr key={tx.key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '11px 16px' }}>
                    <code style={{ fontSize: 11.5, fontFamily: 'ui-monospace, monospace', background: 'var(--surface-3)', color: 'var(--text-2)', padding: '2px 6px', borderRadius: 5 }}>
                      {tx.id.slice(0, 8).toUpperCase()}
                    </code>
                  </td>
                  <td style={{ padding: '11px 16px', color: 'var(--text-3)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    {new Date(tx.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '11px 16px', fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                    {fmt.format(tx.amount / 100)}
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <StatusBadge status={tx.status} label={statusLabel[tx.status]} />
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    {tx.status === 'allocated'
                      ? <ReceiptLink transactionId={tx.id} />
                      : <span style={{ color: 'var(--text-3)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
