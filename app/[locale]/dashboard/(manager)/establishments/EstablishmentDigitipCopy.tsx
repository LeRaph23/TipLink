'use client';

import { useState } from 'react';

interface Props {
  url: string;
  copyLabel: string;
  copiedLabel: string;
}

export function EstablishmentDigitipCopy({ url, copyLabel, copiedLabel }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* noop */ }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        background: 'none', border: '1px solid var(--border)',
        padding: '5px 10px', borderRadius: 'var(--radius-sm)',
        color: copied ? 'var(--success)' : 'var(--text-2)',
        fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)',
        transition: 'color 150ms',
      }}
    >
      {copied ? copiedLabel : copyLabel}
    </button>
  );
}
