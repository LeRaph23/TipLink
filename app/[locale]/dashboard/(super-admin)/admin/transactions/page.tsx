import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';

function formatAmount(cents: number, currency = 'EUR', locale = 'fr') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, [string, string]> = {
    succeeded: ['var(--success-bg)', 'var(--success)'],
    pending:   ['var(--warning-bg)', 'var(--warning)'],
    failed:    ['var(--error-bg)',   'var(--error)'],
    refunded:  ['var(--neutral-bg)', 'var(--neutral)'],
  };
  const [bg, color] = palette[status] ?? ['var(--neutral-bg)', 'var(--neutral)'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px',
      borderRadius: 100, fontSize: 11, fontWeight: 600, background: bg, color, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
      {status}
    </span>
  );
}

export default async function AdminTransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; group?: string; establishment?: string; from?: string; to?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.admin.transactions');
  const supabase = await createClient();

  let query = supabase
    .from('transactions')
    .select('id, amount, currency, status, created_at, stripe_payment_intent_id, establishment_id, staff_id, establishments(name, group_id, groups(id, name)), staff_profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(300);

  if (sp.status) query = query.eq('status', sp.status as 'pending' | 'succeeded' | 'failed' | 'refunded');
  if (sp.establishment) query = query.eq('establishment_id', sp.establishment);
  if (sp.from) query = query.gte('created_at', sp.from);
  if (sp.to) query = query.lte('created_at', sp.to);

  const { data: txs } = await query;

  let rows = txs ?? [];
  if (sp.group) {
    rows = rows.filter((r) => {
      const est = r.establishments as { group_id: string } | null;
      return est?.group_id === sp.group;
    });
  }

  const totals = rows.reduce(
    (acc, r) => {
      if (r.status === 'succeeded') acc.amount += r.amount ?? 0;
      acc.count += 1;
      return acc;
    },
    { amount: 0, count: 0 }
  );

  const [{ data: groups }, { data: establishments }] = await Promise.all([
    supabase.from('groups').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('establishments').select('id, name').is('deleted_at', null).order('name'),
  ]);

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {t('title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          {t('subtitle', { n: rows.length, volume: formatAmount(totals.amount, 'EUR', locale) })}
        </p>
      </div>

      <form method="get" style={{
        display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)',
        padding: 14, marginBottom: 18,
      }}>
        <select name="status" defaultValue={sp.status ?? ''} style={inputCompact}>
          <option value="">{t('anyStatus')}</option>
          {['pending', 'succeeded', 'failed', 'refunded'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select name="group" defaultValue={sp.group ?? ''} style={inputCompact}>
          <option value="">{t('anyGroup')}</option>
          {(groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select name="establishment" defaultValue={sp.establishment ?? ''} style={inputCompact}>
          <option value="">{t('anyEstablishment')}</option>
          {(establishments ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input type="date" name="from" defaultValue={sp.from ?? ''} style={inputCompact} />
        <input type="date" name="to" defaultValue={sp.to ?? ''} style={inputCompact} />
        <button type="submit" style={{
          padding: '9px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--accent)',
          border: '1px solid var(--accent)', color: 'var(--accent-contrast, #fff)',
          fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        }}>
          {t('apply')}
        </button>
      </form>

      {rows.length === 0 ? (
        <div style={{
          padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13,
          background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)',
        }}>
          {t('empty')}
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {[t('colDate'), t('colAmount'), t('colEstablishment'), t('colGroup'), t('colStaff'), t('colStatus'), t('colStripe')].map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 14px', textAlign: i === 1 ? 'right' : 'left',
                    fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const est = r.establishments as { name: string; groups: { name: string } | null } | null;
                const staff = r.staff_profiles as { full_name: string } | null;
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 14px', color: 'var(--text-3)' }}>
                      {new Date(r.created_at).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text)', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {formatAmount(r.amount, r.currency.toUpperCase(), locale)}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>{est?.name ?? '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>{est?.groups?.name ?? '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>{staff?.full_name ?? '—'}</td>
                    <td style={{ padding: '10px 14px' }}><StatusBadge status={r.status} /></td>
                    <td style={{ padding: '10px 14px' }}>
                      {r.stripe_payment_intent_id ? (
                        <a
                          href={`https://dashboard.stripe.com/payments/${r.stripe_payment_intent_id}`}
                          style={{ fontSize: 11.5, color: 'var(--accent)' }}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Stripe ↗
                        </a>
                      ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const inputCompact: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 12.5, fontFamily: 'var(--font)',
};
