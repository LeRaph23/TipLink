'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

type Pack = 's' | 'm' | 'l';

type Props = {
  onAddToCart: (pack: Pack) => void;
  locale: string;
};

const PACK_IMAGES = [
  // 5 placeholder visuals per pack — SVG inline rectangles with NFC icon
  null, null, null, null, null,
];

function SmartTagSVG({ bg = '#f5f3ff', accent = '#7c3aed', size = 200 }: { bg?: string; accent?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <rect width="200" height="200" rx="24" fill={bg} />
      <rect x="60" y="60" width="80" height="80" rx="16" fill={accent} fillOpacity="0.12" stroke={accent} strokeOpacity="0.3" strokeWidth="1.5" />
      <path d="M80 100c0-11 9-20 20-20" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      <path d="M120 100c0 11-9 20-20 20" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      <circle cx="100" cy="100" r="5" fill={accent} />
      <path d="M73 100c0-14.9 12.1-27 27-27" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
      <path d="M127 100c0 14.9-12.1 27-27 27" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
    </svg>
  );
}

const GALLERY_CONFIGS = [
  { bg: '#f5f3ff', accent: '#7c3aed' },
  { bg: '#f0fdf4', accent: '#0ea36b' },
  { bg: '#fff7ed', accent: '#f59e0b' },
  { bg: '#fdf2f8', accent: '#db2777' },
  { bg: '#eff6ff', accent: '#3b82f6' },
];

export function ProductCard({ onAddToCart, locale: _locale }: Props) {
  const t = useTranslations('landing');
  const [activeImg, setActiveImg] = useState(0);
  const [selectedPack, setSelectedPack] = useState<Pack>('m');

  const packs: Array<{ key: Pack; label: string; sub: string }> = [
    { key: 's', label: t('product.packS'), sub: t('product.packSLabel') },
    { key: 'm', label: t('product.packM'), sub: t('product.packMLabel') },
    { key: 'l', label: t('product.packL'), sub: t('product.packLLabel') },
  ];

  const bullets = [
    t('product.bullet1'),
    t('product.bullet2'),
    t('product.bullet3'),
    t('product.bullet4'),
    t('product.bullet5'),
  ];

  const specs = [
    { icon: '🧱', label: t('product.material') },
    { icon: '📐', label: t('product.size') },
    { icon: '🔗', label: t('product.adhesive') },
    { icon: '📡', label: t('product.tech') },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: 48,
      alignItems: 'flex-start',
    }}>
      {/* Gallery */}
      <div>
        <div style={{
          width: '100%', aspectRatio: '1/1', borderRadius: 20,
          background: GALLERY_CONFIGS[activeImg].bg,
          border: '1px solid #e6e6f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 12, overflow: 'hidden',
          transition: 'background 300ms ease',
        }}>
          <SmartTagSVG bg={GALLERY_CONFIGS[activeImg].bg} accent={GALLERY_CONFIGS[activeImg].accent} size={240} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {PACK_IMAGES.map((_, i) => (
            <button key={i} onClick={() => setActiveImg(i)} style={{
              width: 56, height: 56, borderRadius: 10, border: activeImg === i ? '2px solid #7c3aed' : '1px solid #e6e6f0',
              background: GALLERY_CONFIGS[i].bg, cursor: 'pointer', padding: 4, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <SmartTagSVG bg={GALLERY_CONFIGS[i].bg} accent={GALLERY_CONFIGS[i].accent} size={40} />
            </button>
          ))}
        </div>
      </div>

      {/* Info panel */}
      <div>
        {/* Rating + name */}
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{t('product.kicker')}</span>
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 900, color: '#0f1020', letterSpacing: '-0.03em', marginBottom: 10 }}>{t('product.name')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ color: '#f59e0b', fontSize: 16 }}>★★★★★</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f1020' }}>{t('product.rating')}</span>
          <span style={{ fontSize: 13, color: '#6b6d85' }}>{t('product.reviewCount')}</span>
        </div>

        {/* Claim badges */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
            padding: '5px 12px', fontSize: 12.5, fontWeight: 700, color: '#0ea36b',
          }}>🛡️ {t('product.claim')}</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#f5f3ff', border: '1px solid #e9d5ff', borderRadius: 8,
            padding: '5px 12px', fontSize: 12.5, fontWeight: 700, color: '#7c3aed',
          }}>{t('product.frenchCompany')}</span>
        </div>

        {/* Pack selector */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#3a3b4f', marginBottom: 10 }}>Pack</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {packs.map((p) => (
              <button key={p.key} onClick={() => setSelectedPack(p.key)} style={{
                padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                border: selectedPack === p.key ? '2px solid #7c3aed' : '1.5px solid #e6e6f0',
                background: selectedPack === p.key ? '#f5f3ff' : '#fff',
                color: selectedPack === p.key ? '#7c3aed' : '#3a3b4f',
                fontSize: 13, fontWeight: 600,
                transition: 'all 140ms',
              }}>
                <div style={{ fontWeight: 700 }}>{p.label}</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{p.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Pricing */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 32, fontWeight: 900, color: '#0f1020', letterSpacing: '-0.02em' }}>{t('product.priceOffer')}</span>
          <span style={{ fontSize: 18, color: '#6b6d85', textDecoration: 'line-through' }}>{t('product.priceFull')}</span>
          <span style={{
            background: '#fef3c7', color: '#d97706', fontSize: 11, fontWeight: 800,
            padding: '3px 10px', borderRadius: 6, letterSpacing: '0.04em',
          }}>{t('product.priceSave')}</span>
        </div>
        <div style={{ fontSize: 12, color: '#6b6d85', marginBottom: 24 }}>
          ⚡ {t('product.get3s')}
        </div>

        {/* Add to cart */}
        <button
          onClick={() => onAddToCart(selectedPack)}
          style={{
            width: '100%', padding: '15px', borderRadius: 12, cursor: 'pointer',
            background: '#7c3aed', color: '#fff', fontSize: 16, fontWeight: 800,
            border: 'none', marginBottom: 20,
            boxShadow: '0 4px 20px rgba(124,58,237,0.35)',
            transition: 'all 140ms',
          }}
        >
          🛒 {t('product.addToCart')}
        </button>

        {/* Bullets */}
        <div style={{ marginBottom: 20 }}>
          {bullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
              <span style={{ color: '#0ea36b', fontSize: 15, flexShrink: 0, marginTop: 1 }}>✓</span>
              <span style={{ fontSize: 14, color: '#3a3b4f', lineHeight: 1.5 }}>{b}</span>
            </div>
          ))}
        </div>

        {/* Product specs */}
        <div style={{ borderTop: '1px solid #e6e6f0', paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6d85', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>{t('product.specs')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {specs.map((s) => (
              <span key={s.label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#f8f8fc', border: '1px solid #e6e6f0', borderRadius: 8,
                padding: '6px 12px', fontSize: 12.5, color: '#3a3b4f', fontWeight: 500,
              }}>{s.icon} {s.label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
