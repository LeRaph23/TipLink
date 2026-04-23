'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface Sticker {
  id: string;
  short_id: string;
  establishments: { id: string; name: string } | null;
}

interface Props {
  stickers: Sticker[];
  baseUrl: string;
}

export function StickerList({ stickers, baseUrl }: Props) {
  const t = useTranslations('dashboard.stickers');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (s: Sticker) => {
    const url = `${baseUrl}/s/${s.short_id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(s.id);
      setTimeout(() => setCopiedId((c) => (c === s.id ? null : c)), 1800);
    } catch {
      /* noop */
    }
  };

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {[t('colShortId'), t('colEstablishment'), t('colUrl'), ''].map((h, i) => (
                <th key={i} style={{
                  padding: '10px 16px', textAlign: i === 3 ? 'right' : 'left',
                  fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                  background: 'var(--surface-2)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stickers.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-3)' }}>
                  {t('empty')}
                </td>
              </tr>
            )}
            {stickers.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '11px 16px' }}>
                  <code style={{
                    fontSize: 11.5, fontFamily: 'ui-monospace, monospace',
                    background: 'var(--surface-3)', color: 'var(--text-2)',
                    padding: '2px 6px', borderRadius: 5, fontWeight: 600,
                  }}>{s.short_id}</code>
                </td>
                <td style={{ padding: '11px 16px', color: 'var(--text-2)' }}>
                  {s.establishments?.name ?? '—'}
                </td>
                <td style={{ padding: '11px 16px' }}>
                  <a
                    href={`/s/${s.short_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12, fontFamily: 'ui-monospace, monospace',
                      color: 'var(--text-3)', textDecoration: 'underline',
                    }}
                  >
                    /s/{s.short_id}
                  </a>
                </td>
                <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    onClick={() => handleCopy(s)}
                    style={{
                      background: 'none', border: '1px solid var(--border)',
                      padding: '5px 10px', borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-2)', fontSize: 12, fontWeight: 500,
                      cursor: 'pointer', fontFamily: 'var(--font)',
                    }}
                  >
                    {copiedId === s.id ? t('linkCopied') : t('copyLink')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
