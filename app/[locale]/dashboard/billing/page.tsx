import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { Link } from '@/i18n/navigation';
import { BillingPortalButton } from './BillingPortalButton';

export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.billing');
  const tc = await getTranslations('common');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const service = createServiceClient();

  const { data: roles } = await service
    .from('user_roles')
    .select('group_id')
    .eq('user_id', user.id)
    .in('role', ['group_admin', 'super_admin'])
    .not('group_id', 'is', null);

  const groupId = roles?.[0]?.group_id ?? null;

  const [{ data: group }, { data: orders }, { data: establishments }] = await Promise.all([
    groupId
      ? service
          .from('groups')
          .select('id, legal_name, platform_fee_bps, stripe_customer_id')
          .eq('id', groupId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    groupId
      ? service
          .from('smarttag_orders')
          .select('id, pack, quantity, status, tracking_number, created_at')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
    groupId
      ? service
          .from('establishments')
          .select('id')
          .eq('group_id', groupId)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] }),
  ]);

  // Compute commission collected over the last 30 days.
  const sinceIso = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const estIds = (establishments ?? []).map((e) => e.id);
  let totalTipsCents = 0;
  let txnCount = 0;
  if (estIds.length > 0) {
    const { data: txns } = await service
      .from('transactions')
      .select('amount')
      .in('establishment_id', estIds)
      .eq('status', 'succeeded')
      .gte('created_at', sinceIso);
    if (txns) {
      for (const t of txns) totalTipsCents += t.amount;
      txnCount = txns.length;
    }
  }
  const bps = group?.platform_fee_bps ?? 200;
  const commissionCents = Math.floor((totalTipsCents * bps) / 10_000);

  const fmt = (cents: number) =>
    new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-IE', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
    }).format(cents / 100);

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {t('title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{t('subtitle')}</p>
      </div>

      {/* Commission summary (last 30 days) */}
      <div style={{
        display: 'grid', gap: 12, marginBottom: 20,
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      }}>
        {[
          { label: t('commissionRate'), value: `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)} %`, hint: t('commissionRateHint') },
          { label: t('tipsCollected30d'), value: fmt(totalTipsCents), hint: t('txnCount', { count: txnCount }) },
          { label: t('commissionPaid30d'), value: fmt(commissionCents), hint: t('commissionPaidHint') },
        ].map((c) => (
          <div key={c.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius)', padding: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              {c.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              {c.value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
              {c.hint}
            </div>
          </div>
        ))}
      </div>

      {/* Actions row */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: 18, marginBottom: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            {t('orderMoreTitle')}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            {t('orderMoreBody')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {group?.stripe_customer_id && (
            <BillingPortalButton label={t('invoicesPortal')} />
          )}
          <Link href="/pricing" style={{
            padding: '9px 16px', borderRadius: 8, textDecoration: 'none',
            background: 'var(--accent)', color: 'var(--accent-fg)',
            fontSize: 13, fontWeight: 600,
          }}>
            {t('orderMoreCta')} {tc('arrowRight')}
          </Link>
        </div>
      </div>

      {/* Orders */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{t('orders')}</span>
        </div>

        {!orders?.length ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            {t('noOrders')}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {[t('orderPack'), t('orderStatus'), t('orderDate'), t('orderTracking')].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '11px 16px', fontWeight: 600 }}>{o.pack.toUpperCase()} · {o.quantity}</td>
                  <td style={{ padding: '11px 16px', color: 'var(--text-2)', textTransform: 'capitalize' }}>{o.status.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '11px 16px', color: 'var(--text-3)' }}>
                    {new Date(o.created_at).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '11px 16px', color: 'var(--text-3)' }}>
                    {o.tracking_number ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {orders?.some(o => o.status === 'pending_fulfillment') && (
          <div style={{
            padding: '12px 18px', borderTop: '1px solid var(--border-subtle)',
            fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6,
          }}>
            {t('pendingFulfillment')}
          </div>
        )}
      </div>
    </div>
  );
}
