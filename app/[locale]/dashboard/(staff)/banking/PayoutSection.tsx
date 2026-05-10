'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestPayout } from '@/actions/stripe';

const MIN_PAYOUT_CENTS = 3_000;

interface Props {
  available: number;
  pending: number;
}

export function PayoutSection({ available, pending }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);

  const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const canPayout = available >= MIN_PAYOUT_CENTS;

  function handlePayout() {
    setError(null);
    startTransition(async () => {
      const res = await requestPayout();
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setSuccess(res.amount);
      router.refresh();
    });
  }

  if (success !== null) {
    return (
      <div style={{
        background: 'var(--success-bg)', border: '1px solid var(--success)',
        borderRadius: 'var(--radius)', padding: '20px 24px', textAlign: 'center',
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--success)' }}>
          Virement de {fmt.format(success / 100)} initié
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
          Les fonds arriveront sur votre IBAN sous 1 à 2 jours ouvrés.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: '24px', marginBottom: 24,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16,
      }}>
        Solde disponible
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1 }}>
            {fmt.format(available / 100)}
          </div>
          {pending > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
              + {fmt.format(pending / 100)} en cours de traitement
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          fontSize: 12.5, color: 'var(--error)', padding: '10px 14px',
          background: 'var(--error-bg)', borderRadius: 8, marginBottom: 14,
        }}>
          {error}
        </div>
      )}

      <button
        onClick={handlePayout}
        disabled={!canPayout || isPending}
        style={{
          width: '100%', padding: '11px 20px', borderRadius: 10, border: 'none',
          background: canPayout ? 'var(--accent)' : 'var(--surface-3)',
          color: canPayout ? '#fff' : 'var(--text-3)',
          fontSize: 13.5, fontWeight: 700, cursor: canPayout ? 'pointer' : 'not-allowed',
          fontFamily: 'var(--font)',
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? 'Virement en cours…' : 'Virer sur mon IBAN →'}
      </button>

      {!canPayout && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10, textAlign: 'center' }}>
          Minimum requis : 30 € — il vous manque {fmt.format((MIN_PAYOUT_CENTS - available) / 100)}.
        </div>
      )}
    </div>
  );
}
