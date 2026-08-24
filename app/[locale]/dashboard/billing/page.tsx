import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { Link } from '@/i18n/navigation';
import { ProCard } from './ProCard';
import { getPlan } from '@/lib/billing/entitlements';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function statusStyle(status: string): { color: string; bg: string; dot: string } {
  switch (status) {
    case 'delivered':     return { color: '#22c55e', bg: '#22c55e18', dot: '●' };
    case 'shipped':       return { color: '#60a5fa', bg: '#3b82f618', dot: '●' };
    case 'ready_to_ship': return { color: '#a78bfa', bg: '#8b5cf618', dot: '●' };
    case 'encoding':      return { color: '#fbbf24', bg: '#f59e0b18', dot: '●' };
    case 'canceled':      return { color: '#f87171', bg: '#ef444418', dot: '●' };
    default:              return { color: '#9ca3af', bg: '#6b728018', dot: '○' };
  }
}

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

  // Resolve caller's role(s):
  //  - super_admin: sees all orders (no group filter)
  //  - group_admin: sees only orders for groups they own
  const { data: allRoles } = await service
    .from('user_roles')
    .select('role, group_id')
    .eq('user_id', user.id);
  const isSuperAdmin = (allRoles ?? []).some((r) => r.role === 'super_admin');
  const ownedGroupIds = (allRoles ?? [])
    .filter((r) => r.role === 'group_admin' && r.group_id != null)
    .map((r) => r.group_id) as string[];

  const ordersQuery = service
    .from('smarttag_orders')
    .select('id, pack, quantity, status, tracking_number, created_at, stripe_invoice_id, shipped_at, delivered_at, group_id, groups(name)')
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: orders } = isSuperAdmin
    ? await ordersQuery
    : ownedGroupIds.length > 0
      ? await ordersQuery.in('group_id', ownedGroupIds)
      : { data: [] };

  // The upsell card needs a group; a super admin browsing every order has none
  // of their own, so it is simply not shown to them.
  const primaryGroupId = ownedGroupIds[0] ?? null;
  const plan = primaryGroupId ? await getPlan(service, primaryGroupId) : 'free';

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          Facturation
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          Commandes et factures SmartTags.
        </p>
      </div>

      {primaryGroupId && (
        <ProCard
          groupId={primaryGroupId}
          isPro={plan === 'pro'}
          locale={locale === 'en' ? 'en' : 'fr'}
        />
      )}

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
          <Link href="/order/solo" style={{
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
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {[
                  ...(isSuperAdmin ? ['Groupe'] : []),
                  t('orderPack'), t('orderStatus'), t('orderDate'),
                  t('orderTracking'), t('orderInvoice'), '',
                ].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const { color, bg, dot } = statusStyle(o.status);
                const orderGroupName = (o as unknown as { groups: { name: string } | null }).groups?.name ?? '—';
                return (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {isSuperAdmin && (
                      <td style={{ padding: '11px 16px', color: 'var(--text-2)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {orderGroupName}
                      </td>
                    )}
                    <td style={{ padding: '11px 16px', fontWeight: 600 }}>
                      {o.pack.toUpperCase()} · {o.quantity}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 9px', borderRadius: 20,
                        background: bg, color, fontSize: 12, fontWeight: 600,
                      }}>
                        {dot} {t(`orderStatusLabel.${o.status}` as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px', color: 'var(--text-3)' }}>
                      {new Date(o.created_at).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '11px 16px', color: 'var(--text-3)', fontFamily: 'monospace', fontSize: 12 }}>
                      {o.tracking_number ?? '—'}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      {o.stripe_invoice_id ? (
                        <Link href={`/dashboard/billing/orders/${o.id}`} style={{ color: 'var(--accent)', fontSize: 12, textDecoration: 'none', fontWeight: 500 }}>
                          {t('viewInvoice')}
                        </Link>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <Link href={`/dashboard/billing/orders/${o.id}`} style={{ color: 'var(--text-3)', fontSize: 12, textDecoration: 'none' }}>
                        {t('viewDetails')} →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}

        {orders?.some(o => ['pending_fulfillment', 'encoding'].includes(o.status)) && (
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
