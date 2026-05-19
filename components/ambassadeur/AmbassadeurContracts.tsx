'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, SectionHeader, Button, Badge, Modal, FONT, WEIGHT, SPACE } from './ui';
import { Icon } from './icons';

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

const STATUS_META: Record<ContractListItem['status'], { label: string; tone: 'warning' | 'success' }> = {
  sent: { label: 'À signer', tone: 'warning' },
  viewed: { label: 'À signer', tone: 'warning' },
  signed: { label: 'Signé', tone: 'success' },
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
    return (
      <Card>
        <div style={{ fontSize: FONT.body, color: 'var(--error)' }}>{error}</div>
      </Card>
    );
  }
  if (!list || list.length === 0) {
    return null; // hide the section entirely when there's nothing to show
  }

  const pendingCount = list.filter((c) => c.status !== 'signed').length;

  return (
    <Card>
      <SectionHeader
        title="Contrats"
        badge={pendingCount > 0 ? <Badge tone="warning">{pendingCount} à signer</Badge> : undefined}
        style={{ marginBottom: SPACE.md }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
        {list.map((c) => {
          const meta = STATUS_META[c.status];
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
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: SPACE.md,
                color: 'inherit',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: FONT.body, fontWeight: WEIGHT.bold, color: 'var(--text)' }}>{c.title}</div>
                <div style={{ fontSize: FONT.label, color: 'var(--text-3)', marginTop: 2 }}>
                  Reçu le {fmtDate(c.sent_at)}
                  {c.signed_at && ` · Signé le ${fmtDate(c.signed_at)}`}
                </div>
              </div>
              <Badge tone={meta.tone}>
                {c.status === 'signed' && <Icon name="check" size={11} />}
                {meta.label}
              </Badge>
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
    </Card>
  );
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

  const footer = detail && !signed ? (
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
  ) : detail && signed ? (
    <div style={{
      padding: '14px 18px', borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md,
      background: 'var(--success-bg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: FONT.body, fontWeight: WEIGHT.semibold, color: 'var(--success)' }}>
        <Icon name="check" size={15} />
        Contrat signé électroniquement
      </div>
      <a
        href={`/api/ambassadeur/${encodeURIComponent(code)}/contracts/${contractId}/download`}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', minHeight: 38,
          padding: '8px 14px', borderRadius: 'var(--radius)',
          background: 'var(--accent)', color: 'var(--accent-fg)',
          fontSize: FONT.body - 1, fontWeight: WEIGHT.bold,
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}
      >Voir / imprimer</a>
    </div>
  ) : undefined;

  return (
    <Modal variant="center" onClose={onClose} title={detail?.title ?? 'Contrat'} footer={footer}>
      {loading && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: FONT.body }}>Chargement…</div>}
      {error && <div style={{ padding: 24, color: 'var(--error)', fontSize: FONT.body }}>{error}</div>}
      {detail && (
        // Sandboxed legal document — it renders on white "paper" with dark
        // text on purpose, independent of the dashboard theme.
        <iframe
          srcDoc={`<div style="font-family:-apple-system,sans-serif;color:#222;padding:24px;max-width:640px;margin:0 auto;line-height:1.6;background:#fff">${detail.content_snapshot}</div>`}
          sandbox=""
          style={{ width: '100%', height: 'min(480px, 50vh)', border: 'none', background: '#fff', display: 'block' }}
          title="contract"
        />
      )}
    </Modal>
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
    // White ink on the near-black pad below — kept hardcoded for contrast.
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
    <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: SPACE.md, cursor: 'pointer', fontSize: FONT.body, color: 'var(--text-2)', lineHeight: 1.5 }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0, cursor: 'pointer', accentColor: 'var(--accent)' }}
        />
        <span>{consentText}</span>
      </label>
      <div style={{ marginBottom: SPACE.sm }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: FONT.label, fontWeight: WEIGHT.semibold, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Signature manuscrite
          </div>
          {hasDrawn && (
            <Button variant="ghost" size="sm" onClick={clear}>Effacer</Button>
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
            borderRadius: 'var(--radius-sm)', touchAction: 'none',
          }}
        />
      </div>
      {error && (
        <div style={{ marginBottom: SPACE.sm, color: 'var(--error)', fontSize: FONT.body - 1 }}>{error}</div>
      )}
      <Button full onClick={submit} disabled={!consent || !hasDrawn} loading={signing}>
        {signing ? 'Signature en cours…' : 'Signer électroniquement'}
      </Button>
    </div>
  );
}
