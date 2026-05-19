'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { PACKS, type PackId } from '@/lib/env';
import { htSuffix } from '@/lib/format-price';
import type { PackPricing } from '@/lib/stripe/pricing';

const PACK_IMAGES: Record<PackId, { src: string; alt: string }> = {
  solo: { src: '/products/solo-3d.jpg', alt: 'Plaque époxy NFC Digitip Solo' },
  duo:  { src: '/products/duo-double.jpg', alt: 'Pack Duo — 2 plaques époxy NFC Digitip' },
};

export function formatPrice(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)' }}>
      <span>{label}</span>
      <span style={{ color: accent ? 'var(--text)' : 'var(--text-2)', fontWeight: accent ? 700 : 500 }}>{value}</span>
    </div>
  );
}

export function OrderSummary({
  pack,
  locale,
  pricing,
  compact = false,
}: {
  pack: PackId;
  locale: string;
  pricing: Record<PackId, PackPricing>;
  compact?: boolean;
}) {
  const t = useTranslations('order.summary');
  const def = PACKS[pack];
  const amount = pricing[pack].unitAmount;
  const img = PACK_IMAGES[pack];

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

      {/* Product image */}
      <div style={{
        position: 'relative', width: '100%', height: compact ? 120 : 160,
        borderRadius: 10, overflow: 'hidden',
        background: 'var(--surface-2)',
      }}>
        <Image
          src={img.src}
          alt={img.alt}
          fill
          sizes="(max-width: 900px) 100vw, 340px"
          style={{ objectFit: 'cover' }}
        />
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
        <Row label={t('hardware')} value={`${formatPrice(amount, locale)} ${htSuffix(locale)}`} />
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
          {formatPrice(amount, locale)}
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginLeft: 4 }}>{htSuffix(locale)}</span>
        </span>
      </div>
    </div>
  );
}
