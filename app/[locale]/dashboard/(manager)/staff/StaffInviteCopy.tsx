'use client';

import { useState, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { regenerateTeamJoinLink } from '@/actions/staff';

export function StaffInviteCopy({
  url,
  establishmentId,
  establishmentName,
}: {
  url: string;
  establishmentId: string;
  establishmentName: string;
}) {
  const locale = useLocale();
  const [urlCopied, setUrlCopied] = useState(false);
  const [smsCopied, setSmsCopied] = useState(false);
  // Holds the freshly rotated link so the manager can copy it immediately,
  // rather than having to trust that the page behind them has caught up.
  const [currentUrl, setCurrentUrl] = useState(url);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const smsText = `Bonjour ! ${establishmentName} vous invite à rejoindre Digitip pour recevoir vos pourboires directement sur votre compte bancaire. Rejoignez l'équipe ici : ${currentUrl}`;

  function regenerate() {
    setRotateError(null);
    startTransition(async () => {
      const res = await regenerateTeamJoinLink(establishmentId, locale);
      if ('error' in res) {
        setRotateError("Le lien n'a pas pu être régénéré. Réessayez.");
        return;
      }
      setCurrentUrl(res.url);
      setConfirming(false);
    });
  }

  function copyUrl() {
    navigator.clipboard.writeText(currentUrl).then(() => {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <code style={{
        flex: 1,
        padding: '8px 12px',
        borderRadius: 8,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        fontSize: 12,
        color: 'var(--text-2)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {currentUrl}
      </code>
      <button type="button" className="btn-accent" onClick={copyUrl} style={{
        padding: '8px 14px', borderRadius: 8,
        background: urlCopied ? 'var(--success)' : 'var(--accent)',
        color: '#fff', border: 'none',
        fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        whiteSpace: 'nowrap', fontFamily: 'var(--font)',
        flexShrink: 0,
      }}>
        {urlCopied ? '✓ Copié !' : 'Copier le lien'}
      </button>
      <button type="button" onClick={copySms} style={{
        padding: '8px 14px', borderRadius: 8,
        background: smsCopied ? 'var(--success)' : 'var(--surface-2)',
        color: smsCopied ? '#fff' : 'var(--text-2)',
        border: '1px solid var(--border)',
        fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        whiteSpace: 'nowrap', fontFamily: 'var(--font)',
        transition: 'background 200ms, color 200ms', flexShrink: 0,
      }}>
        {smsCopied ? '✓ Copié !' : 'Copier le SMS'}
      </button>
    </div>

      {/* Whoever holds this link can add themselves to the team, so it needs a
          way back. Regenerating is the only remedy for a QR already printed,
          forwarded or photographed. Two-step, because it breaks every copy. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {confirming ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              Cela rendra inutilisable tout lien déjà partagé. Continuer ?
            </span>
            <button type="button" onClick={regenerate} disabled={pending} style={{
              padding: '6px 12px', borderRadius: 8, background: 'var(--accent)',
              color: '#fff', border: 'none', fontSize: 12, fontWeight: 600,
              cursor: pending ? 'wait' : 'pointer', opacity: pending ? 0.7 : 1,
              fontFamily: 'var(--font)',
            }}>
              {pending ? 'Régénération…' : 'Oui, régénérer'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={pending} style={{
              padding: '6px 12px', borderRadius: 8, background: 'transparent',
              color: 'var(--text-3)', border: '1px solid var(--border)',
              fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
              Annuler
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} style={{
            padding: '6px 12px', borderRadius: 8, background: 'transparent',
            color: 'var(--text-3)', border: '1px solid var(--border)',
            fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)',
          }}>
            Régénérer le lien
          </button>
        )}
        {rotateError && (
          <span role="alert" style={{ fontSize: 12, color: 'var(--danger, #dc2626)' }}>
            {rotateError}
          </span>
        )}
      </div>
    </div>
  );
}
