'use client';

import { useTranslations } from 'next-intl';
import { PACKS, type PackId } from '@/lib/env';

export function formatPrice(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

export function OrderSummary({
  pack,
  locale,
  compact = false,
}: {
  pack: PackId;
  locale: string;
  compact?: boolean;
}) {
  const t = useTranslations('order.summary');
  const def = PACKS[pack];

  const Row = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)' }}>
      <span>{label}</span>
      <span style={{ color: accent ? 'var(--text)' : 'var(--text-2)', fontWeight: accent ? 700 : 500 }}>{value}</span>
    </div>
  );

  return (
    <div style={{
      padding: compact ? 16 : 22,
      borderRadius: 14,
      background: 'var(--surface)',
      border: '1px solid var(--border-subtle)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'var(--text-3)',
      }}>
        {t('title')}
      </div>

      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
            {t('pack', { pack: pack.toUpperCase() })}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {def.quantity} SmartTags
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Row label={t('hardware')} value={formatPrice(def.hardwareAmount, locale)} />
        <Row label={t('shipping')} value={t('free')} />
        <Row label={t('commission')} value={t('commissionValue')} />
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        paddingTop: 12, borderTop: '1px solid var(--border-subtle)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{t('totalToday')}</span>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em',
        }}>
          {formatPrice(def.hardwareAmount, locale)}
        </span>
      </div>
    </div>
  );
}
