import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { summarizeAttribution } from '@/lib/marketing/attribution';

// Never serve a stale RSC payload — admins expect to see new orders the
// instant Stripe finishes the webhook.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS_ORDER = [
  'pending_payment',
  'pending_fulfillment',
  'encoding',
  'ready_to_ship',
  'shipped',
  'delivered',
  'canceled',
] as const;

function StatusBadge({ status, label }: { status: string; label: string }) {
  const palette: Record<string, [string, string]> = {
    pending_payment:     ['var(--neutral-bg)', 'var(--neutral)'],
    pending_fulfillment: ['var(--warning-bg)', 'var(--warning)'],
    encoding:            ['var(--warning-bg)', 'var(--warning)'],
    ready_to_ship:       ['var(--success-bg)', 'var(--success)'],
    shipped:             ['var(--success-bg)', 'var(--success)'],
    delivered:           ['var(--success-bg)', 'var(--success)'],
    canceled:            ['var(--error-bg)',   'var(--error)'],
  };
  const [bg, color] = palette[status] ?? ['var(--neutral-bg)', 'var(--neutral)'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px',
      borderRadius: 100, fontSize: 11, fontWeight: 600, background: bg, color, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
      {label}
    </span>
  );
}

export default async function AdminOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.admin.orders');
  const supabase = await createClient();

  let query = supabase
    .from('smarttag_orders')
    .select('id, pack, quantity, status, tags_encoded_count, tracking_number, created_at, promo_code, discount_amount, attribution, groups(id, name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (status) query = query.eq('status', status as (typeof STATUS_ORDER)[number]);

  // Paid orders of the last 30 days, whatever the status filter: this is what
  // a paid campaign is judged on, and it must not move when the list is filtered.
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: orders }, { data: recentPaid }] = await Promise.all([
    query,
    supabase
      .from('smarttag_orders')
      .select('attribution')
      .gte('created_at', since)
      .not('status', 'in', '(pending_payment,canceled)'),
  ]);
  const acquisition = summarizeAttribution(recentPaid ?? []);
  const cell = { padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)' } as const;

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {t('title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{t('subtitle')}</p>
      </div>

      <section style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: '16px 0 4px', marginBottom: 22,
      }}>
        <div style={{ padding: '0 14px 10px' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('acquisitionTitle')}</h2>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.5 }}>{t('acquisitionHint')}</p>
        </div>
        {acquisition.length === 0 ? (
          <p style={{ padding: '6px 14px 12px', fontSize: 13, color: 'var(--text-3)' }}>{t('acquisitionEmpty')}</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {[t('acquisitionSource'), t('acquisitionCampaign'), t('acquisitionOrders')].map((h, i) => (
                  <th key={i} style={{
                    ...cell, textAlign: i === 2 ? 'right' : 'left', fontSize: 11, fontWeight: 600,
                    color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {acquisition.map((row) => (
                <tr key={`${row.source ?? ''}|${row.campaign ?? ''}`}>
                  <td style={{ ...cell, color: 'var(--text)', fontWeight: 500 }}>{row.source ?? t('sourceDirect')}</td>
                  <td style={{ ...cell, color: 'var(--text-2)' }}>{row.campaign ?? '—'}</td>
                  <td style={{ ...cell, textAlign: 'right', color: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{row.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <Link
          href="/dashboard/admin/orders"
          style={{
            padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500,
            background: !status ? 'var(--accent)' : 'var(--surface-2)',
            color: !status ? 'var(--accent-contrast, #fff)' : 'var(--text-2)',
            border: '1px solid ' + (!status ? 'var(--accent)' : 'var(--border-subtle)'),
          }}
        >
          {t('filterAll')}
        </Link>
        {STATUS_ORDER.map((s) => (
          <Link
            key={s}
            href={{ pathname: '/dashboard/admin/orders', query: { status: s } }}
            style={{
              padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500,
              background: status === s ? 'var(--accent)' : 'var(--surface-2)',
              color: status === s ? 'var(--accent-contrast, #fff)' : 'var(--text-2)',
              border: '1px solid ' + (status === s ? 'var(--accent)' : 'var(--border-subtle)'),
            }}
          >
            {t(`status.${s}`)}
          </Link>
        ))}
      </div>

      {!orders || orders.length === 0 ? (
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
                {[t('colGroup'), t('colPack'), t('colQuantity'), t('colProgress'), t('colStatus'), t('colSource'), t('colDate')].map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                    textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const group = o.groups as { id: string; name: string } | null;
                const hasPromo = !!o.promo_code;
                const attribution = o.attribution as { source?: string; campaign?: string } | null;
                return (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <Link href={`/dashboard/admin/orders/${o.id}`} style={{ color: 'var(--text)', fontWeight: 500 }}>
                          {group?.name ?? '—'}
                        </Link>
                        {hasPromo && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 100,
                            background: 'var(--success-bg)', color: 'var(--success)',
                            border: '1px solid var(--success)',
                          }}>
                            {o.promo_code}
                            {(o.discount_amount ?? 0) > 0 && ` -${((o.discount_amount ?? 0) / 100).toFixed(0)}€`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-2)', textTransform: 'uppercase' }}>{o.pack}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-2)' }}>{o.quantity}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                      {o.tags_encoded_count} / {o.quantity}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <StatusBadge status={o.status} label={t(`status.${o.status}`)} />
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-2)' }}>
                      {attribution?.source
                        ? `${attribution.source}${attribution.campaign ? ` · ${attribution.campaign}` : ''}`
                        : <span style={{ color: 'var(--text-3)' }}>{t('sourceDirect')}</span>}
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-3)' }}>
                      {new Date(o.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
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
