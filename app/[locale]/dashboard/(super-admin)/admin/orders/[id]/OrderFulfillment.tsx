'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { fulfillOrder, markOrderShipped, markOrderDelivered, forceOrderStatus } from '@/actions/admin/orders';

type Establishment = { id: string; name: string };
type StockTag = { id: string; short_id: string; batch_label: string | null };

const ALL_STATUSES = [
  'pending_payment',
  'pending_fulfillment',
  'encoding',
  'ready_to_ship',
  'shipped',
  'delivered',
  'canceled',
] as const;
type OrderStatus = (typeof ALL_STATUSES)[number];

type Props = {
  orderId: string;
  quantity: number;
  encodedCount: number;
  status: string;
  trackingNumber: string | null;
  establishments: Establishment[];
  stockTags: StockTag[];
};

const primaryBtn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 'var(--radius-sm)',
  background: 'var(--accent)', border: '1px solid var(--accent)',
  color: 'var(--accent-contrast, #fff)', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--font)',
};
const secondaryBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--font)',
};
const input: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)',
};

export function OrderFulfillment({
  orderId, quantity, encodedCount, status, trackingNumber, establishments, stockTags,
}: Props) {
  const t = useTranslations('dashboard.admin.orders');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [estId, setEstId] = useState('');
  const [countToAssign, setCountToAssign] = useState(Math.max(1, quantity - encodedCount));
  const [tracking, setTracking] = useState(trackingNumber ?? '');
  const [error, setError] = useState<string | null>(null);
  const [forceStatus, setForceStatus] = useState<OrderStatus>(status as OrderStatus);
  const [forceTracking, setForceTracking] = useState(trackingNumber ?? '');
  const [toast, setToast] = useState<string | null>(null);

  const remaining = quantity - encodedCount;
  const canFulfill = remaining > 0 && ['pending_fulfillment', 'encoding'].includes(status);
  const canShip = status === 'ready_to_ship';
  const canDeliver = status === 'shipped';

  function flash(err: string) {
    setError(err);
    setTimeout(() => setError(null), 5000);
  }

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  const statusLabels: Record<OrderStatus, string> = {
    pending_payment:     'En attente de paiement',
    pending_fulfillment: 'En attente de préparation',
    encoding:            'En cours d\'encodage',
    ready_to_ship:       'Prêt à expédier',
    shipped:             'Expédié',
    delivered:           'Livré',
    canceled:            'Annulé',
  };

  return (
    <section>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
        {t('fulfillmentTitle')}
      </h2>

      {error && (
        <div style={{ padding: 10, marginBottom: 12, borderRadius: 'var(--radius-sm)', background: 'var(--error-bg)', color: 'var(--error)', fontSize: 12 }}>
          {error}
        </div>
      )}
      {toast && (
        <div style={{ padding: 10, marginBottom: 12, borderRadius: 'var(--radius-sm)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: 12 }}>
          {toast}
        </div>
      )}

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: 18,
      }}>
        {canFulfill ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <label>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{t('targetEstablishment')}</div>
              <select value={estId} onChange={(e) => setEstId(e.target.value)} style={input}>
                <option value="">—</option>
                {establishments.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
            <label>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
                {t('fulfillCount', { remaining })}
              </div>
              <input
                type="number"
                min={1}
                max={Math.min(remaining, stockTags.length)}
                value={countToAssign}
                onChange={(e) => setCountToAssign(parseInt(e.target.value, 10) || 0)}
                style={input}
              />
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                {t('stockAvailable', { n: stockTags.length })}
              </div>
            </label>
            <div>
              <button
                style={primaryBtn}
                disabled={pending || !estId || countToAssign < 1 || countToAssign > stockTags.length || countToAssign > remaining}
                onClick={() => {
                  const ids = stockTags.slice(0, countToAssign).map((s) => s.id);
                  startTransition(async () => {
                    const res = await fulfillOrder(orderId, ids, estId);
                    if (!res.ok) flash(res.error);
                    else router.refresh();
                  });
                }}
              >
                {pending ? t('working') : t('fulfillConfirm')}
              </button>
            </div>
          </div>
        ) : canShip ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <label>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{t('trackingNumber')}</div>
              <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)} style={input} />
            </label>
            <div>
              <button
                style={primaryBtn}
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const res = await markOrderShipped(orderId, tracking || undefined);
                    if (!res.ok) flash(res.error);
                    else router.refresh();
                  });
                }}
              >
                {pending ? t('working') : t('markShipped')}
              </button>
            </div>
          </div>
        ) : canDeliver ? (
          <button
            style={secondaryBtn}
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const res = await markOrderDelivered(orderId);
                if (!res.ok) flash(res.error);
                else router.refresh();
              });
            }}
          >
            {pending ? t('working') : t('markDelivered')}
          </button>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('nothingToDo')}</div>
        )}
      </div>

      {/* ── Forcer le statut manuellement ── */}
      <div style={{
        marginTop: 20,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
          Forcer le statut (super admin)
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>Nouveau statut</div>
            <select
              value={forceStatus}
              onChange={(e) => setForceStatus(e.target.value as OrderStatus)}
              style={input}
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabels[s]}</option>
              ))}
            </select>
          </div>
          {(forceStatus === 'shipped') && (
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>N° de suivi (optionnel)</div>
              <input
                type="text"
                value={forceTracking}
                onChange={(e) => setForceTracking(e.target.value)}
                placeholder="1Z999AA10123456784"
                style={input}
              />
            </div>
          )}
          <button
            style={{
              ...secondaryBtn,
              borderColor: 'var(--warning, #d97706)',
              color: 'var(--warning, #d97706)',
            }}
            disabled={pending || forceStatus === status}
            onClick={() => {
              startTransition(async () => {
                const res = await forceOrderStatus(orderId, forceStatus, forceTracking || undefined);
                if (!res.ok) flash(res.error);
                else { notify(`Statut → ${statusLabels[forceStatus]}`); router.refresh(); }
              });
            }}
          >
            {pending ? '…' : `Appliquer "${statusLabels[forceStatus]}"`}
          </button>
        </div>
        {forceStatus === status && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>Statut actuel déjà "{statusLabels[status as OrderStatus]}"</div>
        )}
      </div>
    </section>
  );
}
