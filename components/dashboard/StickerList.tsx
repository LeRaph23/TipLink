'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { assignTagToOwnEstablishment } from '@/actions/stickers';

interface Sticker {
  id: string;
  short_id: string;
  establishments: { id: string; name: string } | null;
}

interface Establishment {
  id: string;
  name: string;
}

interface Props {
  stickers: Sticker[];
  establishments?: Establishment[];
  baseUrl: string;
}

export function StickerList({ stickers, establishments = [], baseUrl }: Props) {
  const t = useTranslations('dashboard.stickers');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrShortId, setQrShortId] = useState<string | null>(null);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const canvasRef = useRef<HTMLDivElement>(null);

  // Only worth offering a re-assignment selector when the admin has more than
  // one establishment to move a tag between (the multi-salon case).
  const canReassign = establishments.length > 1;

  const handleReassign = (stickerId: string, establishmentId: string) => {
    setReassignError(null);
    setSavingId(stickerId);
    startTransition(async () => {
      const res = await assignTagToOwnEstablishment(stickerId, establishmentId);
      if ('error' in res) setReassignError(res.error);
      setSavingId(null);
    });
  };

  // Close modal on Escape
  useEffect(() => {
    if (!qrShortId) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setQrShortId(null); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [qrShortId]);

  const handleCopy = async (s: Sticker) => {
    const url = `${baseUrl}/s/${s.short_id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(s.id);
      setTimeout(() => setCopiedId((c) => (c === s.id ? null : c)), 1800);
    } catch { /* noop */ }
  };

  const handleDownloadQr = () => {
    if (!canvasRef.current || !qrShortId) return;
    const canvas = canvasRef.current.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${qrShortId}.png`;
    a.click();
  };

  const qrUrl = qrShortId ? `${baseUrl}/s/${qrShortId}` : '';

  return (
    <>
      {reassignError && (
        <div style={{
          fontSize: 12.5, color: 'var(--error)', background: 'var(--error-bg)',
          padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 12,
        }}>
          {reassignError}
        </div>
      )}
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
                <tr key={s.id} className="dash-row" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '11px 16px' }}>
                    <code style={{
                      fontSize: 11.5, fontFamily: 'ui-monospace, monospace',
                      background: 'var(--surface-3)', color: 'var(--text-2)',
                      padding: '2px 6px', borderRadius: 5, fontWeight: 600,
                    }}>{s.short_id}</code>
                  </td>
                  <td style={{ padding: '11px 16px', color: 'var(--text-2)' }}>
                    {canReassign ? (
                      <select
                        value={s.establishments?.id ?? ''}
                        disabled={savingId === s.id || !s.establishments}
                        onChange={(e) => handleReassign(s.id, e.target.value)}
                        style={{
                          fontSize: 12.5, padding: '5px 8px', borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)', background: 'var(--surface)',
                          color: 'var(--text-2)', fontFamily: 'var(--font)', maxWidth: 200,
                          cursor: s.establishments ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {!s.establishments && <option value="">—</option>}
                        {establishments.map((e) => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                      </select>
                    ) : (
                      s.establishments?.name ?? '—'
                    )}
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
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => setQrShortId(s.short_id)}
                        title="QR Code"
                        style={{
                          background: 'none', border: '1px solid var(--border)',
                          padding: '5px 8px', borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-3)', fontSize: 12, cursor: 'pointer',
                          fontFamily: 'var(--font)',
                        }}
                      >
                        QR
                      </button>
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* QR Modal */}
      {qrShortId && (
        <div
          className="fade-in"
          onClick={() => setQrShortId(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200, backdropFilter: 'blur(4px)',
          }}
        >
          <div
            className="scale-in"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: 32, textAlign: 'center',
              boxShadow: 'var(--shadow-lg)', minWidth: 280,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>
              /s/{qrShortId}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <QRCodeSVG value={qrUrl} size={200} bgColor="transparent" fgColor="var(--text)" />
            </div>
            {/* Hidden canvas for PNG download */}
            <div ref={canvasRef} style={{ display: 'none' }}>
              <QRCodeCanvas value={qrUrl} size={400} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={handleDownloadQr}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                ↓ PNG
              </button>
              <button
                type="button"
                onClick={() => setQrShortId(null)}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-2)', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
