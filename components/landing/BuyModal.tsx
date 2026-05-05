'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

type Pack = 'solo' | 'duo';

type Props = {
  pack: Pack;
  onClose: () => void;
  locale: string;
};

const PACK_INFO: Record<Pack, { qty: number; price: string; full: string; save: string; img: string; alt: string }> = {
  solo: { qty: 1, price: '69,00 €', full: '89,00 €', save: '−22%', img: '/products/solo-3d.jpg', alt: 'Plaque époxy NFC Digitip Solo' },
  duo:  { qty: 2, price: '99,00 €', full: '138,00 €', save: '−28%', img: '/products/duo-double.jpg', alt: 'Pack Duo — 2 plaques époxy NFC Digitip' },
};

export function BuyModal({ pack: initialPack, onClose, locale }: Props) {
  const tc = useTranslations('common');
  const [selectedPack, setSelectedPack] = useState<Pack>(initialPack);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const info = PACK_INFO[selectedPack];

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);
  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/express-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack: selectedPack, locale }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Erreur lors de la création du paiement');
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setLoading(false);
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,16,32,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 560,
        boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px', borderBottom: '1px solid #e6e6f0' }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0f1020', letterSpacing: '-0.02em' }}>
            Votre commande
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b6d85', lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <div style={{ padding: '22px 28px' }}>

          {/* Pack selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {(['solo', 'duo'] as const).map((p) => {
              const pi = PACK_INFO[p];
              const active = selectedPack === p;
              return (
                <button
                  key={p}
                  onClick={() => setSelectedPack(p)}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                    border: active ? '2px solid #E57A97' : '1.5px solid #e6e6f0',
                    background: active ? '#FEF1F4' : '#fafafa',
                    textAlign: 'left', transition: 'all 120ms', position: 'relative',
                  }}
                >
                  {p === 'duo' && (
                    <span style={{
                      position: 'absolute', top: -8, right: 8,
                      background: '#E57A97', color: '#fff', fontSize: 9, fontWeight: 800,
                      padding: '2px 7px', borderRadius: 20, letterSpacing: '0.04em',
                    }}>MEILLEUR PRIX</span>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 700, color: active ? '#E57A97' : '#0f1020', marginBottom: 2 }}>
                    {p === 'solo' ? 'Solo' : 'Duo'}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#6b6d85' }}>
                    {pi.qty} plaque{pi.qty > 1 ? 's' : ''} · {pi.price}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Product card */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            background: '#FEF1F4', border: '1px solid #FBDAE3',
            borderRadius: 14, padding: '14px',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: 10,
              overflow: 'hidden', flexShrink: 0,
              position: 'relative', background: '#ede9fe',
            }}>
              <Image
                src={info.img}
                alt={info.alt}
                fill
                sizes="72px"
                style={{ objectFit: 'cover' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0f1020' }}>Plaque époxy NFC — Digitip</div>
              <div style={{ fontSize: 12.5, color: '#6b6d85', marginTop: 2 }}>
                {selectedPack === 'solo' ? 'Solo — 1 plaque époxy NFC' : 'Duo — 2 plaques époxy NFC'}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 900, color: '#0f1020', letterSpacing: '-0.02em' }}>{info.price}</div>
              <div style={{ fontSize: 12, color: '#a0a0b8', textDecoration: 'line-through' }}>{info.full}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', marginTop: 2 }}>{info.save}</div>
            </div>
          </div>

          {/* Trust items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
            {([
              { icon: <svg width={14} height={14} viewBox="0 0 20 20" fill="none"><path d="M10 2L3 5v5c0 4.5 3 7.5 7 8.5C14 17.5 17 14.5 17 10V5l-7-3z" fill="#0ea36b" opacity=".18"/><path d="M10 2L3 5v5c0 4.5 3 7.5 7 8.5C14 17.5 17 14.5 17 10V5l-7-3z" stroke="#0ea36b" strokeWidth="1.4" strokeLinejoin="round"/><path d="M7 10.5l2 2 4-4" stroke="#0ea36b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>, label: 'Garantie matériel à vie' },
              { icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>, label: 'Livraison offerte en Europe' },
              { icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>, label: 'Paiement sécurisé par Stripe' },
            ] as const).map(({ icon, label }) => (
              <div key={label} style={{ fontSize: 13, color: '#3a3b4f', display: 'flex', alignItems: 'center', gap: 8 }}>
                {icon} {label}
              </div>
            ))}
          </div>

          {error && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 8,
              background: '#fef2f2', border: '1px solid #fecaca',
              fontSize: 13, color: '#dc2626',
            }}>{error}</div>
          )}

          <button
            onClick={handleCheckout}
            disabled={loading}
            style={{
              width: '100%', marginTop: 18, padding: '15px',
              borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? '#F2B3C4' : '#E57A97',
              color: '#fff', fontSize: 16, fontWeight: 800, border: 'none',
              boxShadow: '0 4px 20px rgba(229,122,151,0.35)',
              transition: 'all 140ms',
            }}
          >
            {loading ? tc('loading') : 'Procéder au paiement →'}
          </button>
          <button onClick={onClose} style={{
            width: '100%', marginTop: 8, padding: '11px',
            borderRadius: 10, cursor: 'pointer',
            background: 'none', color: '#6b6d85', fontSize: 14, fontWeight: 500,
            border: '1px solid #e6e6f0',
          }}>{tc('cancel')}</button>
        </div>
      </div>
    </div>
  );
}
