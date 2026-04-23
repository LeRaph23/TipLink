'use client';

import { useState } from 'react';

export function BillingPortalButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    let redirected = false;
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      if (!res.ok) throw new Error('Portal failed');
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        redirected = true;
        window.location.href = data.url;
        return;
      }
      throw new Error('Missing portal URL');
    } catch {
      setError('Unable to open billing portal. Please try again.');
    } finally {
      if (!redirected) setLoading(false);
    }
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <button
        type="button" onClick={handleClick} disabled={loading}
        style={{
          padding: '8px 14px', borderRadius: 8,
          background: 'var(--surface-2)', color: 'var(--text)',
          fontSize: 13, fontWeight: 600, border: '1px solid var(--border)',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1, fontFamily: 'var(--font)',
        }}
      >
        {loading ? '…' : label}
      </button>
      {error && (
        <span style={{ fontSize: 12, color: 'var(--error)' }}>{error}</span>
      )}
    </div>
  );
}
