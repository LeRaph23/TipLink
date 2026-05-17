'use client';

import { useState, useTransition } from 'react';

interface Props {
  onUpload: (front: File, back: File | null) => Promise<{ ok: true } | { error: string }>;
  pendingVerification?: boolean;
}

const label: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block',
};

export function IdentityDocumentUpload({ onUpload, pendingVerification }: Props) {
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div style={{
        background: 'var(--success-bg)', border: '1px solid var(--success)',
        borderRadius: 10, padding: '14px 16px', fontSize: 12.5, color: 'var(--success)',
      }}>
        <strong>Pièce d&apos;identité envoyée.</strong> Stripe la vérifie sous 1 à 2 jours
        ouvrés — tes virements seront débloqués automatiquement ensuite.
      </div>
    );
  }

  function submit() {
    if (!front) { setError('Ajoute au moins le recto de ta pièce d\'identité.'); return; }
    setError(null);
    startTransition(async () => {
      const res = await onUpload(front, back);
      if ('error' in res) { setError(res.error); return; }
      setDone(true);
    });
  }

  return (
    <div style={{
      background: 'var(--warning-bg)', border: '1px solid var(--warning)',
      borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--warning)' }}>Vérification d&apos;identité requise.</strong>{' '}
        Stripe demande une photo de ta pièce d&apos;identité (carte d&apos;identité,
        passeport ou titre de séjour) pour débloquer tes virements. Photo JPEG ou PNG,
        nette et entière.
      </div>

      {error && (
        <div style={{ fontSize: 12, color: 'var(--error)', padding: '8px 12px', background: 'var(--error-bg)', borderRadius: 8 }}>
          {error}
        </div>
      )}

      <div>
        <span style={label}>Recto (obligatoire)</span>
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={(e) => setFront(e.target.files?.[0] ?? null)}
          style={{ fontSize: 12.5, color: 'var(--text-2)' }}
        />
      </div>

      <div>
        <span style={label}>Verso (si carte d&apos;identité)</span>
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={(e) => setBack(e.target.files?.[0] ?? null)}
          style={{ fontSize: 12.5, color: 'var(--text-2)' }}
        />
      </div>

      <button
        onClick={submit}
        disabled={pending}
        style={{
          padding: '10px 18px', borderRadius: 10, border: 'none',
          background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700,
          cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? 'Envoi…' : 'Envoyer ma pièce d\'identité →'}
      </button>

      {pendingVerification && (
        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          Un document est déjà en cours de vérification par Stripe.
        </div>
      )}
    </div>
  );
}
