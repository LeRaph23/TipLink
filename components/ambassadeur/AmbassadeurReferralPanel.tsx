'use client';

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Card, SectionHeader, Button, Badge, Stat, Input, ProgressBar, FONT, WEIGHT, SPACE } from './ui';
import { Icon } from './icons';

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
      <Card>
        <div style={{ fontSize: FONT.body, color: 'var(--text-3)' }}>
          Programme parrainage en cours d&apos;activation pour ton compte.
        </div>
      </Card>
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
      text: 'Je gagne 35-45€ par vente sur Digitip, viens tester :',
      url: referralUrl,
    };
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share(shareData);
        return;
      } catch { /* user cancelled */ }
    }
    onCopy();
    setFeedback('Lien copié, colle-le où tu veux');
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
        setFeedback(`${json.sent} email${json.sent > 1 ? 's' : ''} envoyé${json.sent > 1 ? 's' : ''}`);
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
    <Card>
      <SectionHeader title="Parrainage" style={{ marginBottom: 6 }} />
      <div style={{ fontSize: FONT.bodyLg, fontWeight: WEIGHT.bold, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: SPACE.md }}>
        25€ par filleul · +100€ à 5 · +250€ à 10
      </div>

      {/* Hero code */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: SPACE.md, marginBottom: SPACE.md }}>
        <div style={{ fontSize: FONT.micro, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          Ton code perso
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: WEIGHT.heavy, color: 'var(--text)', letterSpacing: '0.02em', wordBreak: 'break-all' }}>
          {referralCode}
        </div>
        <div style={{ fontSize: FONT.label, color: 'var(--text-3)', marginTop: SPACE.sm, wordBreak: 'break-all' }}>
          {referralUrl}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: SPACE.sm, marginBottom: SPACE.md }}>
        <Button full onClick={onShare} iconLeft={<Icon name="share" size={15} />}>Partager</Button>
        <Button full variant="secondary" onClick={onCopy} iconLeft={<Icon name={copied ? 'check' : 'copy'} size={15} />}>
          {copied ? 'Copié' : 'Copier le lien'}
        </Button>
        <Button full variant="secondary" onClick={() => setShowQr(s => !s)} iconLeft={<Icon name="qr" size={15} />}>
          {showQr ? 'Masquer QR' : 'QR Code'}
        </Button>
      </div>

      {showQr && (
        // The QR code must sit on a solid white background to stay scannable
        // regardless of the dashboard theme.
        <div style={{ display: 'flex', justifyContent: 'center', padding: SPACE.md, background: '#fff', borderRadius: 'var(--radius-sm)', marginBottom: SPACE.md }}>
          <QRCodeSVG value={referralUrl} size={180} level="M" />
        </div>
      )}

      {/* Email senders */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: SPACE.md, marginBottom: SPACE.md }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: FONT.body - 1, fontWeight: WEIGHT.semibold, color: 'var(--text-2)', marginBottom: SPACE.sm }}>
          <Icon name="mail" size={14} />
          Envoyer à des potes par email (jusqu&apos;à 5)
        </div>
        {emails.map((e, i) => (
          <Input
            key={i}
            type="email"
            placeholder="email@exemple.fr"
            value={e}
            onChange={ev => setEmails(prev => prev.map((x, j) => j === i ? ev.target.value : x))}
            style={{ marginBottom: 6 }}
          />
        ))}
        <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center', marginTop: SPACE.sm }}>
          {emails.length < 5 && (
            <Button variant="ghost" size="sm" onClick={() => setEmails(prev => [...prev, ''])}>+ Ajouter</Button>
          )}
          <Button size="sm" onClick={onSendEmails} loading={sending} style={{ marginLeft: 'auto' }}>
            {sending ? 'Envoi…' : 'Envoyer'}
          </Button>
        </div>
        {feedback && <div style={{ fontSize: FONT.body - 1, color: 'var(--text-2)', marginTop: SPACE.sm }}>{feedback}</div>}
      </div>

      {/* Stats grid */}
      <div className="dash-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: SPACE.sm, marginBottom: SPACE.md }}>
        <StatBox label="Filleuls validés" value={stats.validated.toString()} tone="success" />
        <StatBox label="En attente" value={(stats.pendingAdmin + stats.pendingSales).toString()} />
        <StatBox label="Gains parrainage" value={fmtEuros(stats.totalEarnedCents)} tone="success" />
      </div>

      {/* Milestone progress */}
      <div style={{ marginBottom: SPACE.md }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: SPACE.sm, fontSize: FONT.label, color: 'var(--text-3)', marginBottom: SPACE.xs }}>
          <span>Progression milestones</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textAlign: 'right' }}>
            {stats.validated < 5
              ? `${stats.toMilestone5} filleul${stats.toMilestone5 > 1 ? 's' : ''} pour +100€`
              : stats.validated < 10
                ? `${stats.toMilestone10} pour +250€`
                : <><Icon name="trophy" size={12} /> Tous les milestones atteints</>}
          </span>
        </div>
        <ProgressBar value={milestoneProgress} max={100} color="var(--success)" />
      </div>

      {/* Filleuls list */}
      {(filleuls.length > 0 || pendingApplications.length > 0) && (
        <div>
          <SectionHeader title="Tes filleuls" style={{ marginBottom: 6 }} />
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
    </Card>
  );
}

function FilleulRow({ name, status }: { name: string; status: 'pending_admin' | 'pending_sales' | 'validated' }) {
  const cfg = {
    pending_admin: { label: 'Examen admin', tone: 'neutral' as const },
    pending_sales: { label: '< 3 ventes', tone: 'warning' as const },
    validated:     { label: 'Validé · +25€', tone: 'success' as const },
  }[status];

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ fontSize: FONT.body, color: 'var(--text)', fontWeight: WEIGHT.medium, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
      <Badge tone={cfg.tone}>{cfg.label}</Badge>
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: string; tone?: 'default' | 'success' }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: SPACE.md }}>
      <Stat label={label} value={value} tone={tone} />
    </div>
  );
}
