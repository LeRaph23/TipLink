'use client';

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface ReferralData {
  referralCode: string | null;
  referralUrl: string | null;
  stats: {
    pendingAdmin: number;
    pendingSales: number;
    validated: number;
    totalEarnedCents: number;
    toMilestone5: number;
    toMilestone10: number;
  };
  filleuls: Array<{ id: string; firstName: string; status: 'validated' | 'pending_sales'; createdAt: string }>;
  pendingApplications: Array<{ id: string; firstName: string; createdAt: string }>;
}

function fmtEuros(cents: number) {
  return `${Math.round(cents / 100)}€`;
}

export function AmbassadeurReferralPanel({ code }: { code: string }) {
  const [data, setData] = useState<ReferralData | null>(null);
  const [emails, setEmails] = useState<string[]>(['']);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(() => {
    fetch(`/api/ambassadeur/${code}/referrals`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); })
      .catch(() => {});
  }, [code]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!data) return null;
  if (!data.referralCode || !data.referralUrl) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Programme parrainage en cours d&apos;activation pour ton compte.</div>
      </div>
    );
  }

  const { referralCode, referralUrl, stats, filleuls, pendingApplications } = data;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setFeedback('Copie impossible');
    }
  };

  const onShare = async () => {
    const shareData = {
      title: 'Rejoins-moi sur Digitip',
      text: 'Je gagne 25-35€ par vente sur Digitip — viens tester :',
      url: referralUrl,
    };
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share(shareData);
        return;
      } catch { /* user cancelled */ }
    }
    onCopy();
    setFeedback('Lien copié — colle-le où tu veux');
    setTimeout(() => setFeedback(null), 2200);
  };

  const onSendEmails = async () => {
    const clean = emails.map(e => e.trim()).filter(Boolean);
    if (clean.length === 0) { setFeedback('Renseigne au moins un email.'); return; }
    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/ambassadeur/${code}/refer/email`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: clean }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFeedback(json.error ?? 'Échec envoi');
      } else {
        setFeedback(`✓ ${json.sent} email${json.sent > 1 ? 's' : ''} envoyé${json.sent > 1 ? 's' : ''}`);
        setEmails(['']);
      }
    } catch {
      setFeedback('Erreur réseau');
    } finally {
      setSending(false);
    }
  };

  const milestoneProgress = stats.validated >= 10 ? 100 : stats.validated >= 5
    ? 50 + ((stats.validated - 5) / 5) * 50
    : (stats.validated / 5) * 50;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        Parrainage
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 14 }}>
        25€ par filleul · +100€ à 5 · +250€ à 10
      </div>

      {/* Hero code */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          Ton code perso
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.02em', wordBreak: 'break-all' }}>
          {referralCode}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, wordBreak: 'break-all' }}>
          {referralUrl}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 14 }}>
        <button onClick={onShare} style={btnPrimary}>📲 Partager</button>
        <button onClick={onCopy} style={btnSecondary}>{copied ? '✓ Copié' : '📋 Copier le lien'}</button>
        <button onClick={() => setShowQr(s => !s)} style={btnSecondary}>{showQr ? 'Masquer QR' : '⬚ QR Code'}</button>
      </div>

      {showQr && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16, background: '#fff', borderRadius: 'var(--radius-sm)', marginBottom: 14 }}>
          <QRCodeSVG value={referralUrl} size={180} level="M" />
        </div>
      )}

      {/* Email senders */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
          ✉️ Envoyer à des potes par email (jusqu&apos;à 5)
        </div>
        {emails.map((e, i) => (
          <input
            key={i}
            type="email"
            placeholder="email@exemple.fr"
            value={e}
            onChange={ev => setEmails(prev => prev.map((x, j) => j === i ? ev.target.value : x))}
            style={inputStyle}
          />
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          {emails.length < 5 && (
            <button onClick={() => setEmails(prev => [...prev, ''])} style={btnGhost} type="button">+ Ajouter</button>
          )}
          <button onClick={onSendEmails} disabled={sending} style={{ ...btnPrimary, marginLeft: 'auto', opacity: sending ? 0.6 : 1 }}>
            {sending ? 'Envoi...' : 'Envoyer'}
          </button>
        </div>
        {feedback && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>{feedback}</div>}
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
        <StatBox label="Filleuls validés" value={stats.validated.toString()} accent />
        <StatBox label="En attente" value={(stats.pendingAdmin + stats.pendingSales).toString()} />
        <StatBox label="Gains parrainage" value={fmtEuros(stats.totalEarnedCents)} accent />
      </div>

      {/* Milestone progress */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
          <span>Progression milestones</span>
          <span>
            {stats.validated < 5
              ? `${stats.toMilestone5} filleul${stats.toMilestone5 > 1 ? 's' : ''} pour +100€`
              : stats.validated < 10
                ? `${stats.toMilestone10} pour +250€`
                : '🏆 Tous les milestones atteints'}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${milestoneProgress}%`, background: 'var(--success, #22c55e)', borderRadius: 99, transition: 'width .6s' }} />
        </div>
      </div>

      {/* Filleuls list */}
      {(filleuls.length > 0 || pendingApplications.length > 0) && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            Tes filleuls
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pendingApplications.map(a => (
              <FilleulRow key={a.id} name={a.firstName} status="pending_admin" />
            ))}
            {filleuls.map(f => (
              <FilleulRow key={f.id} name={f.firstName} status={f.status} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FilleulRow({ name, status }: { name: string; status: 'pending_admin' | 'pending_sales' | 'validated' }) {
  const cfg = {
    pending_admin: { label: 'Examen admin', color: 'var(--text-3)', bg: 'var(--surface-3)' },
    pending_sales: { label: '< 3 ventes', color: 'var(--warning, #eab308)', bg: 'var(--warning-bg, rgba(234,179,8,0.12))' },
    validated:     { label: 'Validé · +25€', color: 'var(--success, #22c55e)', bg: 'rgba(34,197,94,0.12)' },
  }[status];

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{name}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: '4px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {cfg.label}
      </div>
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent ? 'var(--success, #22c55e)' : 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  background: 'var(--success, #22c55e)', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  background: 'transparent', color: 'var(--text-2)', border: '1px dashed var(--border)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 6, fontFamily: 'inherit',
};
