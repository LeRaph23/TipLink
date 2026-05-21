'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ambassadeur/icons';

type ContractListItem = {
  id: string;
  title: string;
  status: 'sent' | 'viewed' | 'signed';
  sent_at: string;
  viewed_at: string | null;
  signed_at: string | null;
  content_hash: string;
};

type ContractDetail = {
  id: string;
  title: string;
  content_snapshot: string;
  content_hash: string;
  consent_text: string;
  status: 'sent' | 'viewed' | 'signed';
  signed_at: string | null;
};

const STATUS_LABEL: Record<ContractListItem['status'], { label: string; bg: string; color: string }> = {
  sent:   { label: 'À signer', bg: 'var(--warning-bg)', color: 'var(--warning)' },
  viewed: { label: 'À signer', bg: 'var(--warning-bg)', color: 'var(--warning)' },
  signed: { label: 'Signé',    bg: 'var(--success-bg)', color: 'var(--success)' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function CommercialContracts({ code }: { code: string }) {
  const [list, setList] = useState<ContractListItem[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch(`/api/commercial/${encodeURIComponent(code)}/contracts`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setList(d.contracts ?? []);
      })
      .catch(() => setError('Impossible de charger vos contrats.'));
  }, [code]);

  useEffect(() => {
    refresh();
    // ?tab=contrats&download=<id> deep-link: auto-open the signed contract
    // download page in a new tab so reviewers can land directly on the PDF.
    if (typeof window !== 'undefined') {
      const dl = new URL(window.location.href).searchParams.get('download');
      if (dl) {
        window.open(`/api/commercial/${encodeURIComponent(code)}/contracts/${dl}/download`, '_blank', 'noopener');
      }
    }
  }, [refresh, code]);

  if (error) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16, fontSize: 13, color: 'var(--error)' }}>
        {error}
      </div>
    );
  }
  if (list === null) return null;
  if (list.length === 0) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: '24px 20px', marginBottom: 16, textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
          Aucun contrat reçu pour le moment
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55 }}>
          Votre contrat d&apos;apporteur d&apos;affaires sera transmis ici dès que la direction
          commerciale Digitip l&apos;aura préparé. Une notification vous sera envoyée par email.
        </div>
      </div>
    );
  }

  const pendingCount = list.filter((c) => c.status !== 'signed').length;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
          Contrats d&apos;apporteur d&apos;affaires
        </div>
        {pendingCount > 0 && (
          <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: 'var(--warning-bg)', color: 'var(--warning)' }}>
            {pendingCount} à signer
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((c) => {
          const st = STATUS_LABEL[c.status];
          return (
            <button
              key={c.id}
              onClick={() => setOpenId(c.id)}
              style={{
                background: 'var(--surface-2)',
                border: `1px solid ${c.status === 'signed' ? 'var(--border)' : 'var(--accent-border)'}`,
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, color: 'inherit', fontFamily: 'inherit',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{c.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>
                  Reçu le {fmtDate(c.sent_at)}
                  {c.signed_at && ` · Signé le ${fmtDate(c.signed_at)}`}
                </div>
              </div>
              <span style={{
                padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                background: st.bg, color: st.color, whiteSpace: 'nowrap',
              }}>
                {c.status === 'signed' ? '✓ ' : ''}{st.label}
              </span>
            </button>
          );
        })}
      </div>

      {openId && (
        <ContractModal
          code={code}
          contractId={openId}
          onClose={() => { setOpenId(null); refresh(); }}
        />
      )}
    </div>
  );
}

function ContractModal({ code, contractId, onClose }: {
  code: string;
  contractId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/commercial/${encodeURIComponent(code)}/contracts/${contractId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) { setError(d.error); setLoading(false); return; }
        setDetail(d);
        setSigned(d.status === 'signed');
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setError('Impossible de charger le contrat.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [code, contractId]);

  // Lock body scroll while the modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px', overflow: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: 680,
          maxHeight: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {detail?.title ?? 'Contrat'}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 20, color: 'var(--text-3)', padding: 4, lineHeight: 1,
            }}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {loading && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Chargement…</div>}
          {error && <div style={{ padding: 24, color: 'var(--error)', fontSize: 13 }}>{error}</div>}
          {detail && (
            <iframe
              srcDoc={`<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#222;padding:24px;max-width:680px;margin:0 auto;line-height:1.6;background:#fff">${detail.content_snapshot}</div>`}
              sandbox=""
              style={{ flex: 1, width: '100%', minHeight: 320, border: 'none', background: '#fff' }}
              title="Contrat"
            />
          )}
        </div>

        {/* Footer */}
        {detail && !signed && (
          <SignatureFooter
            code={code}
            contractId={contractId}
            consentText={detail.consent_text}
            consent={consent}
            setConsent={setConsent}
            signing={signing}
            setSigning={setSigning}
            onSigned={() => {
              setSigned(true);
              setDetail({ ...detail, status: 'signed', signed_at: new Date().toISOString() });
            }}
          />
        )}
        {detail && signed && (
          <div style={{
            padding: '14px 18px', borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            background: 'var(--success-bg)', flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>
              <Icon name="check" size={14} strokeWidth={2.5} />
              Contrat signé électroniquement
            </div>
            <a
              href={`/api/commercial/${encodeURIComponent(code)}/contracts/${contractId}/download`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '9px 16px', borderRadius: 8,
                background: 'var(--accent)', color: '#fff',
                fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >Télécharger / imprimer →</a>
          </div>
        )}
      </div>
    </div>
  );
}

function SignatureFooter({
  code, contractId, consentText, consent, setConsent, signing, setSigning, onSigned,
}: {
  code: string;
  contractId: string;
  consentText: string;
  consent: boolean;
  setConsent: (b: boolean) => void;
  signing: boolean;
  setSigning: (b: boolean) => void;
  onSigned: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    // Dark ink on a near-white pad — B2B-appropriate aesthetic.
    ctx.strokeStyle = '#111';
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    setHasDrawn(true);
    lastPosRef.current = getPos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    const last = lastPosRef.current ?? pos;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPosRef.current = pos;
  };
  const handlePointerUp = () => {
    drawingRef.current = false;
    lastPosRef.current = null;
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      // clearRect with the raw canvas dimensions covers the DPR-scaled space.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      setHasDrawn(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!consent) { setError('Vous devez cocher la clause de consentement.'); return; }
    if (!hasDrawn) { setError('Veuillez tracer votre signature dans le cadre.'); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSigning(true);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const res = await fetch(`/api/commercial/${encodeURIComponent(code)}/contracts/${contractId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureDataUrl: dataUrl, consentChecked: true }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Signature refusée.'); setSigning(false); return; }
      onSigned();
    } catch {
      setError('Erreur réseau, veuillez réessayer.');
    } finally {
      setSigning(false);
    }
  };

  return (
    <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, cursor: 'pointer', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0, cursor: 'pointer', accentColor: 'var(--accent)' }}
        />
        <span>{consentText}</span>
      </label>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Signature manuscrite
          </div>
          {hasDrawn && (
            <button onClick={clear} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
              Effacer
            </button>
          )}
        </div>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            display: 'block', width: '100%', height: 140,
            background: '#fff', border: '1px dashed var(--border)',
            borderRadius: 8, touchAction: 'none', cursor: 'crosshair',
          }}
        />
      </div>
      {error && (
        <div style={{ marginBottom: 10, color: 'var(--error)', fontSize: 12.5, padding: '6px 10px', background: 'var(--error-bg)', borderRadius: 6 }}>{error}</div>
      )}
      <button
        onClick={submit}
        disabled={!consent || !hasDrawn || signing}
        style={{
          width: '100%', padding: '12px 18px', borderRadius: 10, border: 'none',
          background: (consent && hasDrawn && !signing) ? 'var(--accent)' : 'var(--surface-2)',
          color: (consent && hasDrawn && !signing) ? '#fff' : 'var(--text-3)',
          fontSize: 14, fontWeight: 700,
          cursor: (consent && hasDrawn && !signing) ? 'pointer' : 'not-allowed',
          opacity: signing ? 0.7 : 1,
        }}
      >
        {signing ? 'Signature en cours…' : 'Signer électroniquement'}
      </button>
    </div>
  );
}
