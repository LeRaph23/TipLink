'use client';

import { useState, useTransition } from 'react';
import { saveContractTemplate } from '@/actions/admin/ambassador-contracts';
import type { ContractTemplate } from './ContractsTab';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
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

export function ContractTemplatesTab({ templates }: { templates: ContractTemplate[] }) {
  const [editing, setEditing] = useState<ContractTemplate | null>(null);
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (editing) {
    return (
      <EditContractTemplateForm
        template={editing}
        onCancel={() => { setEditing(null); setErr(null); }}
        onSave={(payload) => {
          setErr(null);
          startTransition(async () => {
            const r = await saveContractTemplate(payload);
            if (!r.ok) { setErr(r.error); return; }
            setEditing(null);
            window.location.reload();
          });
        }}
        isPending={isPending}
        err={err}
      />
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          style={btnPrimary}
          onClick={() => setEditing({
            id: '', name: '', version: 1, body_html: '', consent_text: '',
            is_active: true, updated_at: '',
          })}
        >
          + Nouveau template
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          Modifier un template déjà signé crée automatiquement une nouvelle version (l&apos;ancienne reste disponible pour les contrats déjà signés).
        </span>
      </div>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Nom', 'Version', 'Statut', 'Modifié', 'Actions'].map((h, i) => (
                <th key={i} style={{
                  padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                  color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em',
                  borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border-subtle)', opacity: t.is_active ? 1 : 0.55 }}>
                <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text)' }}>{t.name}</td>
                <td style={{ padding: '11px 14px', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>v{t.version}</td>
                <td style={{ padding: '11px 14px' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 600,
                    background: t.is_active ? 'var(--success-bg)' : 'var(--surface-2)',
                    color: t.is_active ? 'var(--success)' : 'var(--text-3)',
                  }}>{t.is_active ? '● Actif' : '○ Archivé'}</span>
                </td>
                <td style={{ padding: '11px 14px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                  {t.updated_at ? new Date(t.updated_at).toLocaleDateString('fr-FR') : '—'}
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <button style={btnSecondary} onClick={() => { setEditing(t); setErr(null); }}>Modifier</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditContractTemplateForm({
  template, onCancel, onSave, isPending, err,
}: {
  template: ContractTemplate;
  onCancel: () => void;
  onSave: (t: { id?: string; name: string; version?: number; body_html: string; consent_text: string; is_active?: boolean }) => void;
  isPending: boolean;
  err: string | null;
}) {
  const [name, setName] = useState(template.name);
  const [bodyHtml, setBodyHtml] = useState(template.body_html);
  const [consentText, setConsentText] = useState(template.consent_text);
  const [isActive, setIsActive] = useState(template.is_active);

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 20,
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', color: 'var(--text)' }}>
        {template.id ? `Modifier : ${template.name} (v${template.version})` : 'Nouveau template'}
      </h3>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Nom</label>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
          Corps HTML du contrat — variables : {'{{ambassador_name}}'} {'{{ambassador_siret}}'} {'{{promo_code}}'} {'{{date}}'}
        </label>
        <textarea
          style={{ ...inputStyle, minHeight: 360, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
        />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
          Phrase de consentement (case à cocher avant signature)
        </label>
        <textarea
          style={{ ...inputStyle, minHeight: 70, fontSize: 12.5 }}
          value={consentText}
          onChange={(e) => setConsentText(e.target.value)}
        />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Actif (utilisable pour envoyer de nouveaux contrats)
        </label>
      </div>
      {err && (
        <div style={{ marginBottom: 12, color: 'var(--error)', fontSize: 13, padding: '8px 12px', background: 'var(--error-bg)', borderRadius: 6 }}>{err}</div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          style={btnPrimary}
          disabled={isPending}
          onClick={() => onSave({
            id: template.id || undefined,
            name, body_html: bodyHtml, consent_text: consentText,
            is_active: isActive,
            version: template.id ? undefined : 1,
          })}
        >
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button style={btnSecondary} onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}
