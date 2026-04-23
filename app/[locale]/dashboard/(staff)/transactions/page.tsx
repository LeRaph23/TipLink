import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    succeeded: ['var(--success-bg)', 'var(--success)'],
    pending:   ['var(--warning-bg)', 'var(--warning)'],
    failed:    ['var(--error-bg)',   'var(--error)'],
  };
  const [bg, color] = map[status] ?? ['var(--neutral-bg)', 'var(--neutral)'];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 600, background: bg, color, whiteSpace: 'nowrap' }}>
      {status !== 'failed' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />}
      {status.charAt(0).toUpperCase() + status.slice(1)}
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

  const { data: staffProfile } = await supabase
    .from('staff_profiles').select('id').eq('user_id', user!.id).is('deleted_at', null).maybeSingle();

  const { data: transactions } = await supabase
    .from('transactions').select('id, amount, currency, status, created_at')
    .eq('staff_id', staffProfile?.id ?? '').order('created_at', { ascending: false }).limit(100);

  const currency = transactions?.[0]?.currency ?? 'EUR';
  const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 });
  const total = transactions?.filter(tx => tx.status === 'succeeded').reduce((sum, tx) => sum + tx.amount, 0) ?? 0;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>{t('title')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          {t('totalReceived')}: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt.format(total / 100)}</span>
        </p>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {[t('colReference'), t('colDate'), t('colAmount'), t('colStatus')].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!transactions?.length ? (
                <tr><td colSpan={4} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-3)' }}>{t('empty')}</td></tr>
              ) : transactions.map(tx => (
                <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
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
                    <StatusBadge status={tx.status} />
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
