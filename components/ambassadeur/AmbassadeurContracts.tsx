'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

const STATUS_META: Record<ContractListItem['status'], { label: string; color: string; bg: string }> = {
  sent: { label: 'À signer', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  viewed: { label: 'À signer', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  signed: { label: 'Signé ✓', color: 'var(--success)', bg: 'var(--success-bg)' },
};

export function AmbassadeurContracts({ code }: { code: string }) {
  const [list, setList] = useState<ContractListItem[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch(`/api/ambassadeur/${encodeURIComponent(code)}/contracts`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setList(d.contracts ?? []);
      })
      .catch(() => setError('Impossible de charger les contrats.'));
  }, [code]);

  useEffect(() => {
    refresh();
    // ?tab=contracts deep-link is read by the parent; nothing to do here
  }, [refresh]);

  if (list === null && !error) {
    return null;
  }
  if (error) {
    return <Section>
      <div style={{ fontSize: 12, color: 'var(--error)' }}>{error}</div>
    </Section>;
  }
  if (!list || list.length === 0) {
    return null; // hide the section entirely when there's nothing to show
  }

  const pendingCount = list.filter((c) => c.status !== 'signed').length;

  return (
    <Section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Contrats
        </div>
        {pendingCount > 0 && (
          <span style={{
            padding: '2px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 700,
            background: 'var(--warning-bg)', color: 'var(--warning)',
          }}>
            {pendingCount} à signer
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((c) => (
          <button
            key={c.id}
            onClick={() => setOpenId(c.id)}
            style={{
              background: 'var(--surface)',
              border: `1px solid ${c.status === 'signed' ? 'var(--border-subtle)' : 'var(--warning)'}`,
              borderRadius: 'var(--radius)',
              padding: '12px 14px',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              color: 'inherit',
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                Reçu le {fmtDate(c.sent_at)}
                {c.signed_at && ` · Signé le ${fmtDate(c.signed_at)}`}
              </div>
            </div>
            <span style={{
              padding: '3px 10px', borderRadius: 99, fontSize: 10.5, fontWeight: 700,
              background: STATUS_META[c.status].bg, color: STATUS_META[c.status].color,
              whiteSpace: 'nowrap',
            }}>{STATUS_META[c.status].label}</span>
          </button>
        ))}
      </div>

      {openId && (
        <ContractModal
          code={code}
          contractId={openId}
          onClose={() => { setOpenId(null); refresh(); }}
        />
      )}
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 16 }}>{children}</div>;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ContractModal({
  code, contractId, onClose,
}: {
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
    fetch(`/api/ambassadeur/${encodeURIComponent(code)}/contracts/${contractId}`)
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

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: 12,
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        width: '100%', maxWidth: 720, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {detail?.title ?? 'Contrat'}
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-3)', padding: '5px 12px', borderRadius: 6,
            cursor: 'pointer', fontSize: 12,
          }}>Fermer</button>
        </div>

        <div style={{ overflow: 'auto', flex: 1, padding: 0 }}>
          {loading && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Chargement…</div>}
          {error && <div style={{ padding: 24, color: 'var(--error)', fontSize: 13 }}>{error}</div>}
          {detail && (
            <iframe
              srcDoc={`<div style="font-family:-apple-system,sans-serif;color:#222;padding:24px;max-width:640px;margin:0 auto;line-height:1.6;background:#fff">${detail.content_snapshot}</div>`}
              sandbox=""
              style={{ width: '100%', height: 480, border: 'none', background: '#fff' }}
              title="contract"
            />
          )}
        </div>

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
            background: 'var(--success-bg)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>
              ✓ Contrat signé électroniquement
            </div>
            <a
              href={`/api/ambassadeur/${encodeURIComponent(code)}/contracts/${contractId}/download`}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: '8px 16px', borderRadius: 8,
                background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600,
                textDecoration: 'none',
              }}
            >Voir / imprimer →</a>
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
    ctx.strokeStyle = '#fff';
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
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!consent) { setError('Coche la case de consentement.'); return; }
    if (!hasDrawn) { setError('Trace ta signature dans le cadre.'); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSigning(true);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const res = await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/contracts/${contractId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureDataUrl: dataUrl, consentChecked: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Signature refusée.');
        setSigning(false);
        return;
      }
      onSigned();
    } catch {
      setError('Erreur réseau, réessaie.');
    } finally {
      setSigning(false);
    }
  };

  return (
    <div style={{
      padding: '14px 18px', borderTop: '1px solid var(--border)',
      background: 'var(--surface-2)',
    }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, cursor: 'pointer', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ marginTop: 3, flexShrink: 0, cursor: 'pointer' }}
        />
        <span>{consentText}</span>
      </label>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Signature manuscrite
          </div>
          {hasDrawn && (
            <button onClick={clear} style={{
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-3)', padding: '3px 10px', borderRadius: 6,
              cursor: 'pointer', fontSize: 11,
            }}>Effacer</button>
          )}
        </div>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            display: 'block', width: '100%', height: 130,
            background: '#0a0a0a', border: '1px dashed var(--border)',
            borderRadius: 8, touchAction: 'none',
          }}
        />
      </div>
      {error && (
        <div style={{ marginBottom: 8, color: 'var(--error)', fontSize: 12 }}>{error}</div>
      )}
      <button
        onClick={submit}
        disabled={signing || !consent || !hasDrawn}
        style={{
          width: '100%', padding: '12px', borderRadius: 8, border: 'none',
          background: (signing || !consent || !hasDrawn) ? 'var(--surface-3)' : 'var(--accent)',
          color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: (signing || !consent || !hasDrawn) ? 'not-allowed' : 'pointer',
        }}
      >
        {signing ? 'Signature en cours…' : 'Signer électroniquement'}
      </button>
    </div>
  );
}
