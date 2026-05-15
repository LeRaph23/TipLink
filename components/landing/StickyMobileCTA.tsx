'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

// Bottom-anchored order button shown only on mobile, sliding in once the
// visitor has scrolled past the hero so a CTA is always within reach.
export function StickyMobileCTA({ onOrderClick }: { onOrderClick: () => void }) {
  const t = useTranslations('landing');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 620);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className="sticky-mcta"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 250,
        padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
        background: 'rgba(255,255,255,0.94)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid #e4e4ec',
        transform: visible ? 'translateY(0)' : 'translateY(120%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 320ms cubic-bezier(.22,1,.36,1), opacity 320ms cubic-bezier(.22,1,.36,1)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <button
        onClick={onOrderClick}
        className="btn-accent"
        style={{
          width: '100%', padding: '14px', borderRadius: 12, cursor: 'pointer',
          background: '#E57A97', color: '#fff', fontSize: 16, fontWeight: 800,
          border: 'none', boxShadow: '0 4px 20px rgba(229,122,151,0.4)',
        }}
      >
        {t('hero.cta')} →
      </button>
    </div>
  );
}
