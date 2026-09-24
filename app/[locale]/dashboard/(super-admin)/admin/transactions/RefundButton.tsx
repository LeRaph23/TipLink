'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { refundTip } from '@/actions/admin/transactions';

export function RefundButton({ transactionId, amountLabel }: { transactionId: string; amountLabel: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const reason = window.prompt(
            `Rembourser ${amountLabel} au client (pourboire + frais de service) ?\n` +
            'Le virement à l’établissement sera annulé. Cette action est définitive.\n\nRaison :',
          );
          if (reason === null) return;
          startTransition(async () => {
            const res = await refundTip(transactionId, reason);
            setMessage(res.ok ? 'Remboursé' : res.error);
            if (res.ok) router.refresh();
          });
        }}
        style={{
          fontSize: 11.5, padding: '3px 8px', borderRadius: 6, cursor: pending ? 'wait' : 'pointer',
          border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--error)',
        }}
      >
        {pending ? '…' : 'Rembourser'}
      </button>
      {message && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{message}</span>}
    </span>
  );
}
