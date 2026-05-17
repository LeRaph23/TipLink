'use client';

import { useState } from 'react';
import { getTransactionReceipt } from '@/actions/transactions';

interface Props {
  transactionId: string;
  label?: string;
}

// On-demand link to the Stripe-hosted receipt for a tip transaction. The
// receipt URL is resolved lazily (one Stripe call per click) so listing pages
// stay fast regardless of how many rows they render.
export function ReceiptLink({ transactionId, label = 'Reçu' }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setLoading(true);
    setError(null);
    const res = await getTransactionReceipt(transactionId);
    setLoading(false);
    if (res.ok) {
      window.open(res.receiptUrl, '_blank', 'noopener,noreferrer');
    } else {
      setError(res.error);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      title={error ?? undefined}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        font: 'inherit',
        fontSize: 11.5,
        fontWeight: 500,
        cursor: loading ? 'wait' : 'pointer',
        color: error ? 'var(--error)' : 'var(--accent)',
      }}
    >
      {loading ? '…' : error ? '⚠ ' + error : `${label} ↗`}
    </button>
  );
}
