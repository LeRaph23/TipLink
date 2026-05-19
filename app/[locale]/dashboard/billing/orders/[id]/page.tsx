import { setRequestLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { Link } from '@/i18n/navigation';
import { CancelOrderButton } from './CancelOrderButton';
import { getOrderPaymentSummary } from '@/actions/billing/orders';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Status =
  | 'pending_payment'
  | 'pending_fulfillment'
  | 'encoding'
  | 'ready_to_ship'
  | 'shipped'
  | 'delivered'
  | 'canceled';

const STATUS_ORDER: Status[] = [
  'pending_fulfillment',
  'encoding',
  'ready_to_ship',
  'shipped',
  'delivered',
];

function statusColor(status: Status) {
  switch (status) {
    case 'delivered':     return '#22c55e';
    case 'shipped':       return '#60a5fa';
    case 'ready_to_ship': return '#a78bfa';
    case 'encoding':      return '#fbbf24';
    case 'canceled':      return '#f87171';
    default:              return '#9ca3af';
  }
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.billing');
  const tc = await getTranslations('common');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const service = createServiceClient();

  // Find the user's group
  const { data: roles } = await service
    .from('user_roles')
    .select('group_id, role')
    .eq('user_id', user.id)
    .in('role', ['group_admin', 'super_admin'])
    .not('group_id', 'is', null);

  const groupIds = (roles ?? []).map((r) => r.group_id).filter(Boolean) as string[];
  const isSuperAdmin = (roles ?? []).some((r) => r.role === 'super_admin');

  // Fetch the order
  const { data: order } = await service
    .from('smarttag_orders')
    .select('id, group_id, pack, quantity, status, tracking_number, created_at, shipped_at, delivered_at, fulfilled_at, invoice_pdf_url, mangopay_payin_id, shipping_address, promo_code, discount_amount')
    .eq('id', id)
    .single();

  if (!order) notFound();
  // Security: only the order's group or super_admin can view
  if (!isSuperAdmin && !groupIds.includes(order.group_id)) notFound();

  // Reserved SmartTags (with short_id + per-tag encoded state).
  const { data: linkedTags } = await service
    .from('smarttag_order_tags')
    .select('sticker_id, encoded_at, nfc_stickers(short_id, establishment_id, establishments(name))')
    .eq('order_id', id)
    .order('encoded_at', { ascending: false });
  type LinkRow = {
    sticker_id: string;
    encoded_at: string | null;
    nfc_stickers: { short_id: string; establishment_id: string | null; establishments: { name: string } | null } | null;
  };
  const tags = (linkedTags ?? []) as unknown as LinkRow[];

  // Stripe payment summary (amount, method, hosted receipt url)
  const paySummary = await getOrderPaymentSummary(id);
  const payment = paySummary.ok ? paySummary.data : null;

  // The invoice PDF is generated in-app and stored on the order row.
  const invoicePdfUrl: string | null = order.invoice_pdf_url;
  const invoiceNumber: string | null = null;

  const cancellable = ['pending_payment', 'pending_fulfillment', 'encoding', 'ready_to_ship']
    .includes(order.status);
  const fmtMoney = (cents: number, currency: string) =>
    new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-IE', {
      style: 'currency', currency, minimumFractionDigits: 2,
    }).format(cents / 100);

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-IE', {
          day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })
      : null;

  const currentStatusIdx = STATUS_ORDER.indexOf(order.status as Status);
  const shippingAddr = order.shipping_address as Record<string, string> | null;

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/dashboard/billing" style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}>
          ← {t('backToOrders')}
        </Link>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', marginTop: 12, marginBottom: 4 }}>
          {t('orderDetailTitle', { pack: order.pack.toUpperCase(), qty: order.quantity })}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
          {t('orderDetailRef', { ref: order.id.slice(0, 8).toUpperCase() })} · {fmtDate(order.created_at)}
        </p>
      </div>

      {/* Status timeline */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: 24, marginBottom: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 20 }}>
          {t('orderTimeline')}
        </div>
        {order.status === 'canceled' ? (
          <div style={{ color: '#f87171', fontWeight: 600, fontSize: 14 }}>
            ✕ {t('orderStatusLabel.canceled')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {STATUS_ORDER.map((step, idx) => {
              const done = currentStatusIdx >= idx;
              const active = currentStatusIdx === idx;
              const dateMap: Partial<Record<Status, string | null>> = {
                pending_fulfillment: order.created_at,
                encoding: order.fulfilled_at,
                ready_to_ship: order.fulfilled_at,
                shipped: order.shipped_at,
                delivered: order.delivered_at,
              };
              const stepDate = dateMap[step];
              const color = done ? statusColor(step) : 'var(--border)';
              return (
                <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%',
                      background: done ? color : 'transparent',
                      border: `2px solid ${color}`,
                      flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {done && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#000' }} />}
                    </div>
                    {idx < STATUS_ORDER.length - 1 && (
                      <div style={{ width: 2, height: 32, background: done && currentStatusIdx > idx ? color : 'var(--border-subtle)', marginTop: 2 }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: idx < STATUS_ORDER.length - 1 ? 0 : 0, paddingTop: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: done ? 'var(--text)' : 'var(--text-3)' }}>
                      {t(`orderStatusLabel.${step}` as Parameters<typeof t>[0])}
                    </div>
                    {done && stepDate && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, marginBottom: 8 }}>
                        {fmtDate(stepDate)}
                      </div>
                    )}
                    {!done && <div style={{ marginBottom: 8 }} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Order details */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)', padding: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
            {t('orderInfo')}
          </div>
          {[
            { label: t('orderPack'), value: `${order.pack.toUpperCase()} · ${order.quantity} SmartTag${order.quantity > 1 ? 's' : ''}` },
            { label: t('orderStatus'), value: t(`orderStatusLabel.${order.status}` as Parameters<typeof t>[0]) },
            ...(order.tracking_number ? [{ label: t('orderTracking'), value: order.tracking_number }] : []),
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}>
              <span style={{ color: 'var(--text-3)' }}>{label}</span>
              <span style={{ color: 'var(--text)', fontWeight: 500, textAlign: 'right', maxWidth: '55%', wordBreak: 'break-all' }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Shipping address */}
        {shippingAddr && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius)', padding: 20,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
              {t('shippingAddress')}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7 }}>
              {shippingAddr.name && <div style={{ fontWeight: 600 }}>{shippingAddr.name}</div>}
              {shippingAddr.line1 && <div>{shippingAddr.line1}</div>}
              {shippingAddr.line2 && <div>{shippingAddr.line2}</div>}
              {(shippingAddr.postal_code || shippingAddr.city) && (
                <div>{[shippingAddr.postal_code, shippingAddr.city].filter(Boolean).join(' ')}</div>
              )}
              {shippingAddr.country && <div>{shippingAddr.country}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Payment summary */}
      {payment && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)', padding: 20, marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
            {locale === 'fr' ? 'Paiement' : 'Payment'}
          </div>
          {[
            { label: locale === 'fr' ? 'Montant' : 'Amount', value: fmtMoney(payment.amount, payment.currency) },
            ...(payment.paymentMethod ? [{ label: locale === 'fr' ? 'Méthode' : 'Method', value: payment.paymentMethod }] : []),
            ...((order.discount_amount ?? 0) > 0 ? [{ label: locale === 'fr' ? 'Code promo' : 'Promo code', value: `${order.promo_code} (−${fmtMoney(order.discount_amount ?? 0, payment.currency)})` }] : []),
            ...(order.mangopay_payin_id ? [{ label: 'PayIn', value: order.mangopay_payin_id, mono: true }] : []),
          ].map(({ label, value, mono }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}>
              <span style={{ color: 'var(--text-3)' }}>{label}</span>
              <span style={{ color: 'var(--text)', fontWeight: 500, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all', fontFamily: mono ? 'monospace' : undefined, fontSize: mono ? 12 : 13 }}>{value}</span>
            </div>
          ))}
          {payment.receiptUrl && (
            <div style={{ marginTop: 12 }}>
              <a
                href={payment.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}
              >
                {locale === 'fr' ? 'Voir le reçu Stripe →' : 'View Stripe receipt →'}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Reserved SmartTags */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: 20, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {locale === 'fr' ? `SmartTags réservés (${tags.length}/${order.quantity})` : `Reserved SmartTags (${tags.length}/${order.quantity})`}
          </div>
        </div>
        {tags.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {locale === 'fr'
              ? 'Vos SmartTags seront sélectionnés sous peu dans notre stock.'
              : 'Your SmartTags will be picked from stock shortly.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {tags.map((tag) => {
              const encoded = !!tag.encoded_at;
              return (
                <div key={tag.sticker_id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
                  fontSize: 13,
                }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text)' }}>
                    {tag.nfc_stickers?.short_id ?? tag.sticker_id.slice(0, 8)}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: encoded ? '#22c55e' : 'var(--text-3)',
                  }}>
                    {encoded
                      ? (locale === 'fr' ? '● Programmé' : '● Programmed')
                      : (locale === 'fr' ? '○ En attente' : '○ Pending')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancel — only when status still allows it AND the caller can actually act */}
      {cancellable && (
        <div style={{ marginBottom: 16 }}>
          <CancelOrderButton orderId={order.id} locale={locale} />
        </div>
      )}

      {/* Invoice */}
      {invoicePdfUrl && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)', padding: 20, marginBottom: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              {t('invoice')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {invoiceNumber ? `${t('invoiceNumber')} ${invoiceNumber}` : t('invoiceReady')}
            </div>
          </div>
          {invoicePdfUrl ? (
            <a
              href={`/${locale}/dashboard/billing/orders/${order.id}/invoice`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '9px 18px', borderRadius: 8, textDecoration: 'none',
                background: 'var(--accent)', color: 'var(--accent-fg)',
                fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              ↓ {t('downloadInvoice')}
            </a>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('invoiceGenerating')}</span>
          )}
        </div>
      )}

      <div style={{ paddingTop: 8 }}>
        <Link href="/dashboard/billing" style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}>
          ← {t('backToOrders')}
        </Link>
        {tc('arrowRight').includes('→') && null}
      </div>
    </div>
  );
}
