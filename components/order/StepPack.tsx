'use client';

import { useTranslations } from 'next-intl';
import { PACKS, type PackId } from '@/lib/env';
import { formatPrice } from './OrderSummary';

export function StepPack({
  pack,
  locale,
  onChange,
}: {
  pack: PackId;
  locale: string;
  onChange: (p: PackId) => void;
}) {
  const t = useTranslations('order.pack');
  const packs: PackId[] = ['s', 'm', 'l'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {packs.map((p) => {
        const def = PACKS[p];
        const selected = p === pack;
        const popular = p === 'm';

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
              padding: '18px 22px',
              borderRadius: 14,
              background: selected ? 'rgba(99,102,241,0.08)' : 'var(--surface)',
              border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
              cursor: 'pointer',
              fontFamily: 'var(--font)',
              transition: 'all 160ms',
              boxShadow: selected ? '0 0 0 3px var(--accent-muted)' : 'none',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
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
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                  Pack {p.toUpperCase()}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 3 }}>
                  {t('quantity', { count: def.quantity })}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                {formatPrice(def.hardwareAmount, locale)}
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
