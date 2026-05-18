'use client';

import { useTranslations } from 'next-intl';
import { PACKS, type PackId } from '@/lib/env';
import type { OrderState, Step } from '@/lib/order-validation';
import { formatPrice } from './OrderSummary';
import { htSuffix } from '@/lib/format-price';
import type { PackPricing } from '@/lib/stripe/pricing';

function Row({
  label,
  children,
  step,
  onEdit,
}: {
  label: string;
  children: React.ReactNode;
  step: Step;
  onEdit: (s: Step) => void;
}) {
  const t = useTranslations('order.review');
  return (
    <div style={{
      padding: 18, borderRadius: 12,
      background: 'var(--surface)',
      border: '1px solid var(--border-subtle)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8,
        }}>
          {label}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
          {children}
        </div>
      </div>
      <button
        type="button" onClick={() => onEdit(step)}
        style={{
          fontSize: 12.5, color: 'var(--accent)', fontWeight: 500,
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font)',
        }}
      >
        {t('edit')}
      </button>
    </div>
  );
}

export function StepReview({
  state,
  locale,
  pricing,
  onEdit,
  promoCode,
  onPromoChange,
}: {
  state: OrderState;
  locale: string;
  pricing: Record<PackId, PackPricing>;
  onEdit: (s: Step) => void;
  promoCode?: string;
  onPromoChange?: (code: string) => void;
}) {
  const t = useTranslations('order.review');
  const def = PACKS[state.pack];

  const shippingLines = [
    state.shipping.line1,
    state.shipping.line2,
    `${state.shipping.postal_code} ${state.shipping.city}`,
    state.shipping.country,
  ].filter(Boolean);

  const billingLines = state.business.billing_same
    ? shippingLines
    : state.business.billing
    ? [
        state.business.billing.line1,
        state.business.billing.line2,
        `${state.business.billing.postal_code} ${state.business.billing.city}`,
        state.business.billing.country,
      ].filter(Boolean)
    : shippingLines;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Pack block with totals */}
      <div style={{
        padding: 18, borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05))',
        border: '1px solid rgba(99,102,241,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              Pack {state.pack.toUpperCase()}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              {def.quantity} SmartTags
            </div>
          </div>
          <button
            type="button" onClick={() => onEdit('pack')}
            style={{
              fontSize: 12.5, color: 'var(--accent)', fontWeight: 500,
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            {t('edit')}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: 'var(--text-2)' }}>
            <span>{t('hardware')}</span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{formatPrice(pricing[state.pack].unitAmount, locale)} {htSuffix(locale)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: 'var(--text-2)' }}>
            <span>{t('commission')}</span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{t('commissionValue')}</span>
          </div>
        </div>
      </div>

      <Row label={t('shippingTo')} step="shipping" onEdit={onEdit}>
        {shippingLines.map((l, i) => <div key={i}>{l}</div>)}
      </Row>

      <Row label={t('billedTo')} step="billing" onEdit={onEdit}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{state.business.legal_name}</div>
        {state.business.vat_number && (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 4 }}>
            TVA : {state.business.vat_number}
          </div>
        )}
        {billingLines.map((l, i) => <div key={i}>{l}</div>)}
      </Row>

      <Row label={t('account')} step="account" onEdit={onEdit}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{state.account.full_name}</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{state.account.email}</div>
      </Row>

      {/* Promo code input */}
      {onPromoChange !== undefined && (
        <div style={{
          padding: 16, borderRadius: 12,
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            {t('promoCodeLabel')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={promoCode ?? ''}
              onChange={e => onPromoChange(e.target.value.toUpperCase())}
              placeholder={t('promoCodePlaceholder')}
              maxLength={30}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 8,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)',
                letterSpacing: '0.05em', textTransform: 'uppercase',
              }}
            />
          </div>
          {promoCode && promoCode.trim().length > 1 && (
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
              {t('promoCodeHint')}
            </div>
          )}
        </div>
      )}

      <p style={{
        fontSize: 12, color: 'var(--text-3)',
        textAlign: 'center', marginTop: 8, lineHeight: 1.6,
      }}>
        {t('taxNotice')}
      </p>
    </div>
  );
}
