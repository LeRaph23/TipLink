'use client';

import { useState, useTransition } from 'react';
import {
  sendContractToCommercial,
  revokeCommercialContract,
  type CommercialContractRow,
  type CommercialContractTemplate,
} from '@/actions/admin/commercial-contracts';

interface Props {
  commercialId: string;
  commercialEmail: string | null;
  promoCode: string | null;
  templates: CommercialContractTemplate[];
  initialContracts: CommercialContractRow[];
}

const STATUS: Record<CommercialContractRow['status'], { label: string; bg: string; color: string }> = {
  sent:    { label: 'Envoyé',  bg: 'var(--warning-bg)', color: 'var(--warning)' },
  viewed:  { label: 'Lu',      bg: 'var(--warning-bg)', color: 'var(--warning)' },
  signed:  { label: 'Signé',   bg: 'var(--success-bg)', color: 'var(--success)' },
  revoked: { label: 'Révoqué', bg: 'var(--surface-2)',  color: 'var(--text-3)' },
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function CommercialContractsPanel({
  commercialId, commercialEmail, promoCode, templates, initialContracts,
}: Props) {
  const [contracts, setContracts] = useState(initialContracts);
  const activeTemplates = templates.filter((t) => t.is_active);
  const [templateId, setTemplateId] = useState(activeTemplates[0]?.id ?? '');
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const noEmail = !commercialEmail;

  function send() {
    setMsg(null);
    if (!templateId) { setMsg({ ok: false, text: 'Sélectionnez un modèle de contrat.' }); return; }
    startTransition(async () => {
      const r = await sendContractToCommercial({ commercialId, templateId });
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setMsg({ ok: true, text: `Contrat envoyé à ${commercialEmail}. Un mail d'invitation à signer vient de partir.` });
      // Refresh contracts list inline by appending — the next route load will
      // get the canonical state from the server, but this keeps the UI snappy.
      setContracts((prev) => [
        {
          id: r.contractId,
          commercial_id: commercialId,
          title: activeTemplates.find((t) => t.id === templateId)?.name ?? 'Contrat',
          status: 'sent' as const,
          sent_at: new Date().toISOString(),
          viewed_at: null,
          signed_at: null,
          content_hash: '',
        },
        ...prev,
      ]);
    });
  }

  function revoke(contractId: string) {
    const reason = window.prompt('Motif de la révocation ? (Le commercial ne pourra plus signer ce contrat.)');
    if (!reason?.trim()) return;
    startTransition(async () => {
      const r = await revokeCommercialContract(contractId, reason);
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setContracts((prev) => prev.map((c) => c.id === contractId ? { ...c, status: 'revoked' as const } : c));
      setMsg({ ok: true, text: 'Contrat révoqué.' });
    });
  }

  const portalBase = promoCode ? `/fr/pro/${promoCode.toLowerCase()}` : null;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          Contrats d&apos;apporteur d&apos;affaires
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
          {activeTemplates.length} modèle{activeTemplates.length !== 1 ? 's' : ''} actif{activeTemplates.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Send panel */}
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 8, padding: 12, marginBottom: 12,
      }}>
        {noEmail ? (
          <div style={{ fontSize: 12.5, color: 'var(--warning)', padding: '6px 0' }}>
            Aucune adresse email enregistrée pour ce commercial : impossible d&apos;envoyer un contrat.
          </div>
        ) : activeTemplates.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '6px 0' }}>
            Aucun modèle actif. Créez-en un (à venir) ou réactivez-en un.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Modèle de contrat à envoyer
              </label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 7,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: 13,
                }}
              >
                {activeTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} · v{t.version}</option>
                ))}
              </select>
            </div>
            <button
              onClick={send}
              disabled={isPending || !templateId}
              style={{
                padding: '9px 16px', borderRadius: 7, border: 'none',
                background: 'var(--accent)', color: '#fff',
                fontSize: 12.5, fontWeight: 700, cursor: isPending ? 'wait' : 'pointer',
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? 'Envoi…' : 'Envoyer le contrat par email →'}
            </button>
          </div>
        )}
        {commercialEmail && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-3)' }}>
            Le contrat sera rendu avec la raison sociale, le SIRET, le n° TVA, la forme juridique, le statut commercial et le code promo du Commercial, puis envoyé à <strong>{commercialEmail}</strong>. Le Commercial le signera depuis son espace <code style={{ fontFamily: 'monospace' }}>{portalBase ?? '/pro/[code]'}</code> sécurisé par PIN.
          </div>
        )}
      </div>

      {msg && (
        <div style={{
          marginBottom: 12, padding: '8px 12px', borderRadius: 7, fontSize: 12.5,
          background: msg.ok ? 'var(--success-bg)' : 'var(--error-bg)',
          color: msg.ok ? 'var(--success)' : 'var(--error)',
        }}>
          {msg.text}
        </div>
      )}

      {/* History */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '4px 0 8px' }}>
        Historique
      </div>
      {contracts.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: 12.5 }}>
          Aucun contrat encore envoyé.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
          {contracts.map((c, i) => {
            const st = STATUS[c.status];
            return (
              <div key={c.id} style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto',
                gap: 8, padding: '10px 12px', alignItems: 'center',
                borderTop: i === 0 ? undefined : '1px solid var(--border-subtle)',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                    Envoyé {fmtDateTime(c.sent_at)}
                    {c.viewed_at && ` · Lu ${fmtDateTime(c.viewed_at)}`}
                    {c.signed_at && ` · Signé ${fmtDateTime(c.signed_at)}`}
                  </div>
                </div>
                <span style={{
                  padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                  background: st.bg, color: st.color,
                }}>{st.label}</span>
                {c.status !== 'signed' && c.status !== 'revoked' ? (
                  <button
                    onClick={() => revoke(c.id)}
                    disabled={isPending}
                    style={{
                      padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
                      background: 'transparent', color: 'var(--text-3)',
                      fontSize: 11.5, cursor: isPending ? 'wait' : 'pointer',
                    }}
                  >
                    Révoquer
                  </button>
                ) : <span />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
