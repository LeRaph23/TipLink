'use client';

import { useState } from 'react';

export function StaffInviteCopy({
  url,
  establishmentName,
}: {
  url: string;
  establishmentName: string;
}) {
  const [urlCopied, setUrlCopied] = useState(false);
  const [smsCopied, setSmsCopied] = useState(false);

  const smsText = `Bonjour ! ${establishmentName} vous invite à rejoindre Digitip pour recevoir vos pourboires directement sur votre compte bancaire. Rejoignez l'équipe ici : ${url}`;

  function copyUrl() {
    navigator.clipboard.writeText(url).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 1800);
    });
  }

  function copySms() {
    navigator.clipboard.writeText(smsText).then(() => {
      setSmsCopied(true);
      setTimeout(() => setSmsCopied(false), 1800);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* URL row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <code style={{
          flex: 1,
          padding: '9px 12px',
          borderRadius: 8,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          fontSize: 11.5,
          color: 'var(--text-2)',
          wordBreak: 'break-all',
        }}>
          {url}
        </code>
        <button
          type="button"
          onClick={copyUrl}
          style={{
            padding: '9px 14px',
            borderRadius: 8,
            background: urlCopied ? 'var(--success)' : 'var(--accent)',
            color: '#fff',
            border: 'none',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font)',
            transition: 'background 200ms',
          }}
        >
          {urlCopied ? '✓ Copié !' : 'Copier le lien'}
        </button>
      </div>

      {/* SMS row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{
          flex: 1,
          padding: '9px 12px',
          borderRadius: 8,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          fontSize: 11.5,
          color: 'var(--text-3)',
          lineHeight: 1.55,
          wordBreak: 'break-word',
        }}>
          {smsText}
        </div>
        <button
          type="button"
          onClick={copySms}
          style={{
            padding: '9px 14px',
            borderRadius: 8,
            background: smsCopied ? 'var(--success)' : 'var(--surface)',
            color: smsCopied ? '#fff' : 'var(--text-2)',
            border: '1px solid var(--border)',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font)',
            transition: 'background 200ms, color 200ms',
          }}
        >
          {smsCopied ? '✓ Copié !' : 'Copier le SMS'}
        </button>
      </div>
    </div>
  );
}
