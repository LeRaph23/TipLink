import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { OrderFulfillment } from './OrderFulfillment';

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.admin.orders');
  const supabase = await createClient();

  const { data: order } = await supabase
    .from('smarttag_orders')
    .select('id, pack, quantity, status, tags_encoded_count, tracking_number, shipping_address, shipped_at, delivered_at, fulfilled_at, created_at, group_id, groups(id, name)')
    .eq('id', id)
    .maybeSingle();

  if (!order) notFound();

  const [{ data: establishments }, { data: linkedTags }, { data: stockTags }] = await Promise.all([
    supabase
      .from('establishments')
      .select('id, name')
      .eq('group_id', order.group_id)
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('smarttag_order_tags')
      .select('sticker_id, encoded_at, nfc_stickers(short_id, establishment_id, establishments(name))')
      .eq('order_id', id)
      .order('encoded_at', { ascending: false }),
    supabase
      .from('nfc_stickers')
      .select('id, short_id, batch_label')
      .is('establishment_id', null)
      .order('generated_at', { ascending: true })
      .limit(500),
  ]);

  const group = order.groups as { id: string; name: string } | null;
  type LinkRow = {
    sticker_id: string;
    encoded_at: string;
    nfc_stickers: {
      short_id: string;
      establishment_id: string | null;
      establishments: { name: string } | null;
    } | null;
  };
  const links = (linkedTags ?? []) as unknown as LinkRow[];

  return (
    <div>
      <Link href="/dashboard/admin/orders" style={{ fontSize: 12, color: 'var(--text-3)' }}>
        ← {t('backToList')}
      </Link>

      <div style={{ marginTop: 10, marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {t('detailTitle', { group: group?.name ?? '—' })}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          {t('detailSubtitle', {
            quantity: order.quantity,
            pack: order.pack.toUpperCase(),
            date: new Date(order.created_at).toLocaleDateString(locale, { dateStyle: 'medium' }),
          })}
        </p>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24,
      }}>
        <InfoCell label={t('fieldStatus')} value={t(`status.${order.status}`)} />
        <InfoCell label={t('fieldProgress')} value={`${order.tags_encoded_count} / ${order.quantity}`} />
        <InfoCell label={t('fieldTracking')} value={order.tracking_number ?? '—'} />
      </div>

      <OrderFulfillment
        orderId={order.id}
        quantity={order.quantity}
        encodedCount={order.tags_encoded_count}
        status={order.status}
        trackingNumber={order.tracking_number}
        establishments={(establishments ?? []).map((e) => ({ id: e.id, name: e.name }))}
        stockTags={(stockTags ?? []).map((s) => ({ id: s.id, short_id: s.short_id, batch_label: s.batch_label }))}
      />

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
          {t('linkedTags', { n: links.length })}
        </h2>
        {links.length === 0 ? (
          <div style={{
            padding: 30, textAlign: 'center', color: 'var(--text-3)', fontSize: 13,
            background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)',
          }}>
            {t('linkedEmpty')}
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {[t('colShortId'), t('colEstablishment'), t('colEncodedAt')].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.sticker_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono, monospace)' }}>{l.nfc_stickers?.short_id}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>{l.nfc_stickers?.establishments?.name ?? '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-3)' }}>
                      {new Date(l.encoded_at).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 14,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
    </div>
  );
}
