'use client';

import { useState } from 'react';

export function StaffInviteCopy({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <code style={{
        flex: 1, padding: '9px 12px', borderRadius: 8,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        fontSize: 12, color: 'var(--text-2)', wordBreak: 'break-all',
      }}>
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        style={{
          padding: '9px 14px', borderRadius: 8,
          background: copied ? 'var(--success)' : 'var(--accent)',
          color: '#fff', border: 'none', fontSize: 12.5,
          fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          fontFamily: 'var(--font)', transition: 'background 200ms',
        }}
      >
        {copied ? '✓ Copié !' : 'Copier'}
      </button>
    </div>
  );
}
