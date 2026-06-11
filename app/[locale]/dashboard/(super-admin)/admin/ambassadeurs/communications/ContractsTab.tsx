'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AmbassadorRow } from './EmailsTab';
import {
  sendContractToAmbassador,
  revokeContract,
  getContractAuditTrail,
  type ContractAuditEntry,
} from '@/actions/admin/ambassador-contracts';

export type ContractTemplate = {
  id: string;
  name: string;
  version: number;
  body_html: string;
  consent_text: string;
  is_active: boolean;
  updated_at: string;
};

export type ContractRow = {
  id: string;
  ambassador_id: string;
  ambassador_name: string;
  ambassador_email: string | null;
  title: string;
  status: 'sent' | 'viewed' | 'signed' | 'revoked';
  sent_at: string;
  viewed_at: string | null;
  signed_at: string | null;
  content_hash: string;
};

const STATUS_LABELS: Record<ContractRow['status'], { label: string; color: string; bg: string }> = {
  sent: { label: '● Envoyé', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  viewed: { label: '● Vu', color: 'var(--accent)', bg: 'var(--accent-muted)' },
  signed: { label: '✓ Signé', color: 'var(--success)', bg: 'var(--success-bg)' },
  revoked: { label: '✕ Révoqué', color: 'var(--text-3)', bg: 'var(--surface-2)' },
};

const btnPrimary: React.CSSProperties = {
  padding: '9px 20px', borderRadius: 8, border: 'none',
  background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-3)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
};

export function ContractsTab({
  ambassadors,
  templates,
  contracts,
}: {
  ambassadors: AmbassadorRow[];
  templates: ContractTemplate[];
  contracts: ContractRow[];
}) {
  const router = useRouter();
  const [openSend, setOpenSend] = useState(false);
  const [audit, setAudit] = useState<{ contractId: string; entries: ContractAuditEntry[] } | null>(null);
  const [, startTransition] = useTransition();

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <button
          style={btnPrimary}
          onClick={() => setOpenSend(true)}
          disabled={templates.length === 0}
        >
          + Envoyer un contrat
        </button>
        {templates.length === 0 && (
          <span style={{ fontSize: 12.5, color: 'var(--warning)' }}>
            Aucun template actif — crée d&apos;abord un template de contrat.
          </span>
        )}
      </div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', overflow: 'hidden',
      }}>
        {contracts.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Aucun contrat envoyé pour l&apos;instant.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Ambassadeur', 'Contrat', 'Statut', 'Envoyé', 'Vu', 'Signé', 'Hash', 'Actions'].map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                    color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em',
                    borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text)' }}>{c.ambassador_name}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-2)' }}>{c.title}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 600,
                      background: STATUS_LABELS[c.status].bg, color: STATUS_LABELS[c.status].color,
                    }}>{STATUS_LABELS[c.status].label}</span>
                  </td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(c.sent_at)}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{c.viewed_at ? fmtDate(c.viewed_at) : '—'}</td>
                  <td style={{ padding: '11px 14px', color: c.signed_at ? 'var(--success)' : 'var(--text-3)', whiteSpace: 'nowrap', fontWeight: c.signed_at ? 600 : 400 }}>
                    {c.signed_at ? fmtDate(c.signed_at) : '—'}
                  </td>
                  <td style={{ padding: '11px 14px', fontFamily: 'ui-monospace, monospace', fontSize: 11, color: 'var(--text-3)' }}>{c.content_hash.slice(0, 10)}…</td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        style={btnSecondary}
                        onClick={() => {
                          startTransition(async () => {
                            const entries = await getContractAuditTrail(c.id);
                            setAudit({ contractId: c.id, entries });
                          });
                        }}
                      >Audit</button>
                      {c.status !== 'signed' && c.status !== 'revoked' && (
                        <button
                          style={{ ...btnSecondary, color: 'var(--error)' }}
                          onClick={() => {
                            const reason = prompt('Motif de révocation ?');
                            if (!reason) return;
                            startTransition(async () => {
                              const r = await revokeContract(c.id, reason);
                              if (!r.ok) { alert(r.error); return; }
                              router.refresh();
                            });
                          }}
                        >Révoquer</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openSend && (
        <SendContractModal
          ambassadors={ambassadors}
          templates={templates}
          onClose={() => setOpenSend(false)}
          onSent={() => { setOpenSend(false); router.refresh(); }}
        />
      )}

      {audit && (
        <AuditModal entries={audit.entries} onClose={() => setAudit(null)} />
      )}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function SendContractModal({
  ambassadors, templates, onClose, onSent,
}: {
  ambassadors: AmbassadorRow[];
  templates: ContractTemplate[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [ambassadorId, setAmbassadorId] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 24, width: 460, maxWidth: '92vw',
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', color: 'var(--text)' }}>
          Envoyer un contrat à signer
        </h3>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Ambassadeur</label>
          <select style={inputStyle} value={ambassadorId} onChange={(e) => setAmbassadorId(e.target.value)}>
            <option value="">Sélectionner…</option>
            {ambassadors.map((a) => (
              <option key={a.id} value={a.id} disabled={!a.email}>
                {a.name}{a.email ? '' : ' (pas d\'email)'}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Template</label>
          <select style={inputStyle} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>
            ))}
          </select>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.5 }}>
          Le contrat sera figé au moment de l&apos;envoi (snapshot + SHA-256). L&apos;ambassadeur recevra un email avec un lien
          vers son dashboard pour le lire et le signer électroniquement.
        </p>
        {err && (
          <div style={{ marginBottom: 12, color: 'var(--error)', fontSize: 13 }}>{err}</div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            style={btnPrimary}
            disabled={isPending || !ambassadorId || !templateId}
            onClick={() => {
              setErr(null);
              startTransition(async () => {
                const r = await sendContractToAmbassador({ ambassadorId, templateId });
                if (!r.ok) { setErr(r.error); return; }
                onSent();
              });
            }}
          >
            {isPending ? 'Envoi…' : 'Envoyer'}
          </button>
          <button style={btnSecondary} onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

function AuditModal({ entries, onClose }: { entries: ContractAuditEntry[]; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 24, width: 580, maxWidth: '92vw',
        maxHeight: '80vh', overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            Piste d&apos;audit ({entries.length} événements)
          </h3>
          <button style={btnSecondary} onClick={onClose}>Fermer</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              {['Action', 'Acteur', 'Quand', 'IP (hash)'].map((h, i) => (
                <th key={i} style={{
                  padding: '6px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                  color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em',
                  borderBottom: '1px solid var(--border)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text)' }}>{e.action}</td>
                <td style={{ padding: '8px 10px', color: 'var(--text-2)' }}>{e.actor_type}</td>
                <td style={{ padding: '8px 10px', color: 'var(--text-3)' }}>
                  {new Date(e.created_at).toLocaleString('fr-FR')}
                </td>
                <td style={{ padding: '8px 10px', fontFamily: 'ui-monospace, monospace', fontSize: 11, color: 'var(--text-3)' }}>
                  {e.ip_hash ? `${e.ip_hash.slice(0, 8)}…` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
