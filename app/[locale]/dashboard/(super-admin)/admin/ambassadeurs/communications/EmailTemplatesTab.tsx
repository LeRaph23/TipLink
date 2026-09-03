'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  saveEmailTemplate,
  deleteEmailTemplate,
} from '@/actions/admin/ambassador-emails';
import type { EmailTemplate } from './EmailsTab';

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

export function EmailTemplatesTab({ templates }: { templates: EmailTemplate[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (editing) {
    return (
      <EditEmailTemplateForm
        template={editing}
        onCancel={() => { setEditing(null); setErr(null); }}
        onSave={(updated) => {
          setErr(null);
          startTransition(async () => {
            const res = await saveEmailTemplate(updated);
            if (!res.ok) { setErr(res.error); return; }
            setEditing(null);
            router.refresh();
          });
        }}
        isPending={isPending}
        err={err}
      />
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <button
          style={btnPrimary}
          onClick={() => setEditing({
            id: '', slug: '', name: '', subject: '', body_html: '',
            is_seeded: false, updated_at: '',
          })}
        >
          + Nouveau template
        </button>
      </div>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Nom', 'Slug', 'Sujet', 'Type', 'Modifié', 'Actions'].map((h, i) => (
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
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text)' }}>{t.name}</td>
                <td style={{ padding: '11px 14px', fontFamily: 'ui-monospace, monospace', color: 'var(--text-2)' }}>{t.slug}</td>
                <td style={{ padding: '11px 14px', color: 'var(--text-2)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</td>
                <td style={{ padding: '11px 14px' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 600,
                    background: t.is_seeded ? 'var(--accent-muted)' : 'var(--surface-2)',
                    color: t.is_seeded ? 'var(--accent)' : 'var(--text-3)',
                    border: t.is_seeded ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                  }}>{t.is_seeded ? 'Seed' : 'Custom'}</span>
                </td>
                <td style={{ padding: '11px 14px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                  {t.updated_at ? new Date(t.updated_at).toLocaleDateString('fr-FR') : '—'}
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={btnSecondary} onClick={() => { setEditing(t); setErr(null); }}>Modifier</button>
                    {!t.is_seeded && (
                      <button
                        style={{ ...btnSecondary, color: 'var(--error)' }}
                        onClick={() => {
                          if (!confirm(`Supprimer "${t.name}" ?`)) return;
                          startTransition(async () => {
                            const r = await deleteEmailTemplate(t.id);
                            if (!r.ok) { alert(r.error); return; }
                            router.refresh();
                          });
                        }}
                      >Suppr.</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditEmailTemplateForm({
  template, onCancel, onSave, isPending, err,
}: {
  template: EmailTemplate;
  onCancel: () => void;
  onSave: (t: { id?: string; slug?: string; name: string; subject: string; body_html: string }) => void;
  isPending: boolean;
  err: string | null;
}) {
  const [name, setName] = useState(template.name);
  const [slug, setSlug] = useState(template.slug);
  const [subject, setSubject] = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.body_html);

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 20,
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', color: 'var(--text)' }}>
        {template.id ? `Modifier : ${template.name}` : 'Nouveau template'}
        {template.is_seeded && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)' }}>(seed, slug verrouillé)</span>}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Nom</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Slug</label>
          <input
            style={inputStyle}
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
            disabled={!!template.id}
            placeholder="auto-généré"
          />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Sujet</label>
        <input style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
          Corps HTML, variables : {'{{first_name}}'} {'{{full_name}}'} {'{{promo_code}}'} {'{{dashboard_url}}'}
        </label>
        <textarea
          style={{ ...inputStyle, minHeight: 320, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
        />
      </div>
      {err && (
        <div style={{ marginBottom: 12, color: 'var(--error)', fontSize: 13, padding: '8px 12px', background: 'var(--error-bg)', borderRadius: 6 }}>{err}</div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          style={btnPrimary}
          disabled={isPending}
          onClick={() => onSave({ id: template.id || undefined, slug: slug || undefined, name, subject, body_html: bodyHtml })}
        >
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button style={btnSecondary} onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}
