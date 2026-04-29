'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

type Pack = 'solo' | 'duo';

type Props = {
  pack: Pack;
  onClose: () => void;
  locale: string;
};

const PACK_INFO: Record<Pack, { qty: number; price: string; full: string; label: string }> = {
  solo: { qty: 1, price: '69,00 €', full: '89,00 €', label: 'Solo — 1 plaque époxy NFC' },
  duo:  { qty: 2, price: '99,00 €', full: '138,00 €', label: 'Duo — 2 plaques époxy NFC' },
};

export function BuyModal({ pack, onClose, locale }: Props) {
  const tc = useTranslations('common');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const info = PACK_INFO[pack];

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
        body: JSON.stringify({ pack, locale }),
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
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 480,
        boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e6e6f0' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f1020', letterSpacing: '-0.02em' }}>
            🛒 Votre panier
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b6d85', lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            background: '#f5f3ff', border: '1px solid #e9d5ff',
            borderRadius: 12, padding: '16px',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 10,
              background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, flexShrink: 0,
            }}>📡</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1020' }}>Plaque époxy NFC — Digitip</div>
              <div style={{ fontSize: 13, color: '#6b6d85', marginTop: 2 }}>{info.label}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f1020' }}>{info.price}</div>
              <div style={{ fontSize: 12, color: '#6b6d85', textDecoration: 'line-through' }}>{info.full}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
            {[
              '🛡️ Satisfait ou remboursé 30 jours',
              '🚚 Livraison offerte en Europe',
              '🔒 Paiement sécurisé par Stripe',
            ].map((s) => (
              <div key={s} style={{ fontSize: 13, color: '#3a3b4f', display: 'flex', alignItems: 'center', gap: 8 }}>{s}</div>
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
              width: '100%', marginTop: 20, padding: '15px',
              borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? '#a78bfa' : '#7c3aed',
              color: '#fff', fontSize: 16, fontWeight: 800, border: 'none',
              boxShadow: '0 4px 20px rgba(124,58,237,0.35)',
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
