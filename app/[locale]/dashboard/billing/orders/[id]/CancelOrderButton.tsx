'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelMyOrder } from '@/actions/billing/orders';

type Props = {
  orderId: string;
  locale: string;
};

const labels = {
  fr: {
    section: 'Annuler la commande',
    intro:
      'Vous pouvez annuler votre commande tant qu’elle n’a pas été expédiée. Vos SmartTags seront libérés et le remboursement sera initié depuis votre moyen de paiement sous 5–10 jours ouvrés.',
    reason: 'Motif (optionnel)',
    reasonPlaceholder: 'Pourquoi annulez-vous cette commande ?',
    button: 'Annuler ma commande',
    confirm: 'Confirmer l’annulation',
    back: 'Retour',
    success: 'Commande annulée. Un email de confirmation vous a été envoyé.',
  },
  en: {
    section: 'Cancel order',
    intro:
      'You can cancel as long as the order hasn’t shipped. Your SmartTags will be released and a refund will start on your original payment method within 5–10 business days.',
    reason: 'Reason (optional)',
    reasonPlaceholder: 'Why are you canceling?',
    button: 'Cancel my order',
    confirm: 'Confirm cancellation',
    back: 'Back',
    success: 'Order canceled. We sent you a confirmation email.',
  },
};

export function CancelOrderButton({ orderId, locale }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const L = labels[locale === 'fr' ? 'fr' : 'en'];

  if (done) {
    return (
      <div style={{
        padding: 16, borderRadius: 'var(--radius)',
        background: 'rgba(34,197,94,0.12)',
        border: '1px solid rgba(34,197,94,0.35)',
        color: '#22c55e', fontSize: 13, fontWeight: 500,
      }}>
        ✓ {L.success}
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid rgba(239,68,68,0.35)',
      borderRadius: 'var(--radius)', padding: 20,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color: '#f87171',
        textTransform: 'uppercase', letterSpacing: '0.07em',
        marginBottom: 8,
      }}>
        {L.section}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px', lineHeight: 1.6 }}>
        {L.intro}
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending}
          style={{
            padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
            background: 'transparent',
            border: '1px solid rgba(239,68,68,0.5)',
            color: '#f87171', fontSize: 13, fontWeight: 600,
          }}
        >
          {L.button}
        </button>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <label>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 6 }}>{L.reason}</div>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={L.reasonPlaceholder}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </label>

          {error && (
            <div style={{ fontSize: 12, color: '#f87171' }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const res = await cancelMyOrder(orderId, reason.trim() || null);
                  if (!res.ok) setError(res.error);
                  else { setDone(true); router.refresh(); }
                });
              }}
              style={{
                padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
                background: '#ef4444', border: '1px solid #ef4444',
                color: '#fff', fontSize: 13, fontWeight: 600,
              }}
            >
              {pending ? '…' : L.confirm}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => { setConfirming(false); setError(null); }}
              style={{
                padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 13, fontWeight: 500,
              }}
            >
              {L.back}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
