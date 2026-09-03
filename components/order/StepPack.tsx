'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { PACKS, type PackId } from '@/lib/env';
import { formatPrice } from './OrderSummary';
import { htSuffix } from '@/lib/format-price';
import type { PackPricing } from '@/lib/stripe/pricing';

const PACK_IMAGES: Record<PackId, { src: string; alt: string }> = {
  solo: { src: '/products/solo-3d.jpg', alt: 'Plaque époxy NFC Digitip Solo' },
  duo:  { src: '/products/duo-double.jpg', alt: 'Pack Duo, 2 plaques époxy NFC Digitip' },
};

export function StepPack({
  pack,
  locale,
  pricing,
  onChange,
}: {
  pack: PackId;
  locale: string;
  pricing: Record<PackId, PackPricing>;
  onChange: (p: PackId) => void;
}) {
  const t = useTranslations('order.pack');
  const packs: PackId[] = ['solo', 'duo'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {packs.map((p) => {
        const def = PACKS[p];
        const selected = p === pack;
        const popular = p === 'duo';
        const img = PACK_IMAGES[p];

        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center', justifyContent: 'space-between',
              textAlign: 'left',
              padding: '14px 18px',
              borderRadius: 14,
              background: selected ? 'rgba(99,102,241,0.08)' : 'var(--surface)',
              border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
              cursor: 'pointer',
              fontFamily: 'var(--font)',
              transition: 'all 160ms',
              boxShadow: selected ? '0 0 0 3px var(--accent-muted)' : 'none',
              gap: 16,
            }}
          >
            {popular && !selected && (
              <div style={{
                position: 'absolute', top: -9, right: 16,
                padding: '2px 10px', borderRadius: 100,
                background: 'var(--accent)', color: '#fff',
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                Popular
              </div>
            )}

            {/* Radio */}
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {selected && (
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)' }} />
              )}
            </span>

            {/* Product image */}
            <div style={{
              position: 'relative', width: 72, height: 72, flexShrink: 0,
              borderRadius: 10, overflow: 'hidden',
              background: 'var(--surface-2)',
            }}>
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="72px"
                style={{ objectFit: 'cover' }}
              />
            </div>

            {/* Name + quantity */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 3 }}>
                {t('quantity', { count: def.quantity })}
              </div>
            </div>

            {/* Price */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                {formatPrice(pricing[p].unitAmount, locale)}
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginLeft: 3 }}>{htSuffix(locale)}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {t('oneTime')}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
