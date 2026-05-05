'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

function StarIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="#f59e0b" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}
function ShieldIcon({ size = 14, color = '#0ea36b' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <path d="M10 2L3 5v5c0 4.5 3 7.5 7 8.5C14 17.5 17 14.5 17 10V5l-7-3z" fill={color} opacity="0.18" />
      <path d="M10 2L3 5v5c0 4.5 3 7.5 7 8.5C14 17.5 17 14.5 17 10V5l-7-3z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7 10.5l2 2 4-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BoltIcon({ size = 13, color = '#94a3b8' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <path d="M11 2L4 12h6l-1 6 7-10h-6l1-6z" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
    </svg>
  );
}
function CartIcon({ size = 18, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3 3h2l2.4 8.5h7.2L16 6H6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="16.5" r="1.2" fill={color} />
      <circle cx="14.5" cy="16.5" r="1.2" fill={color} />
    </svg>
  );
}
function CheckIcon({ size = 15, color = '#0ea36b' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r="8" fill={color} opacity="0.12" />
      <path d="M6.5 10.5l2.5 2.5 4.5-5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function LayersIcon({ size = 14, color = '#8B5CF6' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <path d="M10 2L2 6.5l8 4.5 8-4.5L10 2z" fill={color} opacity="0.25" />
      <path d="M10 2L2 6.5l8 4.5 8-4.5L10 2z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M2 11l8 4.5L18 11" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function RulerIcon({ size = 14, color = '#3B82F6' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <rect x="2" y="7" width="16" height="6" rx="1.5" fill={color} opacity="0.12" stroke={color} strokeWidth="1.4" />
      <path d="M5.5 7v3M8.5 7v2M11.5 7v3M14.5 7v2" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function NfcIcon({ size = 14, color = '#10B981' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="10" cy="14" r="1.2" fill={color} />
      <path d="M7.2 11.5a3.8 3.8 0 015.6 0" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4.5 8.8a7.5 7.5 0 0111 0" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function StickerIcon({ size = 14, color = '#F59E0B' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <rect x="3" y="5" width="14" height="10" rx="2" fill={color} opacity="0.15" stroke={color} strokeWidth="1.4" />
      <path d="M7 9h6M7 12h4" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

type Pack = 'solo' | 'duo';

type Props = {
  onAddToCart: (pack: Pack) => void;
  locale: string;
};

const PACK_GALLERIES: Record<Pack, { src: string; alt: string }[]> = {
  solo: [
    { src: '/products/solo-3d.jpg', alt: 'Plaque époxy NFC Digitip — rendu 3D' },
    { src: '/products/solo-table.jpg', alt: 'Plaque Digitip posée sur le comptoir' },
    { src: '/products/solo-wall.jpg', alt: 'Plaque Digitip fixée au mur' },
  ],
  duo: [
    { src: '/products/duo-double.jpg', alt: 'Pack Duo — 2 plaques époxy NFC Digitip' },
    { src: '/products/solo-table.jpg', alt: 'Plaque Digitip posée sur le comptoir' },
    { src: '/products/solo-wall.jpg', alt: 'Plaque Digitip fixée au mur' },
  ],
};

export function ProductCard({ onAddToCart, locale: _locale }: Props) {
  const t = useTranslations('landing');
  const [activeImg, setActiveImg] = useState(0);
  const [selectedPack, setSelectedPack] = useState<Pack>('duo');

  const gallery = PACK_GALLERIES[selectedPack];

  const packs: Array<{ key: Pack; label: string; sub: string }> = [
    { key: 'solo', label: t('product.packS'), sub: t('product.packSLabel') },
    { key: 'duo',  label: t('product.packM'), sub: t('product.packMLabel') },
  ];

  const bullets = [
    t('product.bullet1'),
    t('product.bullet2'),
    t('product.bullet3'),
    t('product.bullet4'),
    t('product.bullet5'),
  ];

  const specs: Array<{ icon: React.ReactNode; label: string }> = [
    { icon: <LayersIcon />, label: t('product.material') },
    { icon: <RulerIcon />,  label: t('product.size') },
    { icon: <StickerIcon />, label: t('product.adhesive') },
    { icon: <NfcIcon />,    label: t('product.tech') },
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
          background: '#FEF1F4',
          border: '1px solid #e6e6f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 12, overflow: 'hidden',
          position: 'relative',
        }}>
          <Image
            src={gallery[activeImg].src}
            alt={gallery[activeImg].alt}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            style={{ objectFit: 'cover' }}
            priority={activeImg === 0}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {gallery.map((img, i) => (
            <button key={i} onClick={() => setActiveImg(i)} style={{
              width: 64, height: 64, borderRadius: 10,
              border: activeImg === i ? '2px solid #E57A97' : '1px solid #e6e6f0',
              background: '#FEF1F4', cursor: 'pointer', padding: 0, flexShrink: 0,
              overflow: 'hidden', position: 'relative',
            }}>
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="64px"
                style={{ objectFit: 'cover' }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Info panel */}
      <div>
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{t('product.kicker')}</span>
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 900, color: '#0f1020', letterSpacing: '-0.03em', marginBottom: 10 }}>{t('product.name')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
            {[1,2,3,4,5].map(i => <StarIcon key={i} size={16} />)}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f1020' }}>{t('product.rating')}</span>
          <span style={{ fontSize: 13, color: '#6b6d85' }}>{t('product.reviewCount')}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
            padding: '5px 12px', fontSize: 12.5, fontWeight: 700, color: '#0ea36b',
          }}><ShieldIcon size={13} color="#0ea36b" /> {t('product.claim')}</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#FEF1F4', border: '1px solid #FBDAE3', borderRadius: 8,
            padding: '5px 12px', fontSize: 12.5, fontWeight: 700, color: '#E57A97',
          }}>{t('product.frenchCompany')}</span>
        </div>

        {/* Pack selector */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#3a3b4f', marginBottom: 10 }}>Choisir</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {packs.map((p) => (
              <button key={p.key} onClick={() => { setSelectedPack(p.key); setActiveImg(0); }} style={{
                padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
                border: selectedPack === p.key ? '2px solid #E57A97' : '1.5px solid #e6e6f0',
                background: selectedPack === p.key ? '#FEF1F4' : '#fff',
                color: selectedPack === p.key ? '#E57A97' : '#3a3b4f',
                fontSize: 13, fontWeight: 600,
                transition: 'all 140ms',
                position: 'relative',
              }}>
                {p.key === 'duo' && (
                  <span style={{
                    position: 'absolute', top: -9, right: 8,
                    background: '#E57A97', color: '#fff', fontSize: 9, fontWeight: 800,
                    padding: '2px 7px', borderRadius: 20, letterSpacing: '0.04em',
                  }}>MEILLEUR PRIX</span>
                )}
                <div style={{ fontWeight: 700 }}>{p.label}</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{p.sub}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 32, fontWeight: 900, color: '#0f1020', letterSpacing: '-0.02em' }}>{t('product.priceOffer')}</span>
          <span style={{ fontSize: 18, color: '#6b6d85', textDecoration: 'line-through' }}>{t('product.priceFull')}</span>
          <span style={{
            background: '#fef3c7', color: '#d97706', fontSize: 11, fontWeight: 800,
            padding: '3px 10px', borderRadius: 6, letterSpacing: '0.04em',
          }}>{t('product.priceSave')}</span>
        </div>
        <div style={{ fontSize: 12, color: '#6b6d85', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 5 }}>
          <BoltIcon size={12} color="#f59e0b" /> {t('product.get3s')}
        </div>

        <button
          onClick={() => onAddToCart(selectedPack)}
          style={{
            width: '100%', padding: '15px', borderRadius: 12, cursor: 'pointer',
            background: '#E57A97', color: '#fff', fontSize: 16, fontWeight: 800,
            border: 'none', marginBottom: 20,
            boxShadow: '0 4px 20px rgba(229,122,151,0.35)',
            transition: 'all 140ms',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}
        >
          <CartIcon size={20} color="#fff" /> {t('product.addToCart')}
        </button>

        <div style={{ marginBottom: 20 }}>
          {bullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
              <CheckIcon size={16} color="#0ea36b" />
              <span style={{ fontSize: 14, color: '#3a3b4f', lineHeight: 1.5 }}>{b}</span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #e6e6f0', paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6d85', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>{t('product.specs')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {specs.map((s) => (
              <span key={String(s.label)} style={{
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
