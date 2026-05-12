'use client';

import { useMemo, useState, useTransition } from 'react';
import { sendAmbassadorEmail } from '@/actions/admin/ambassador-emails';

export type AmbassadorRow = {
  id: string;
  name: string;
  email: string | null;
  promoCode: string;
};

export type EmailTemplate = {
  id: string;
  slug: string;
  name: string;
  subject: string;
  body_html: string;
  is_seeded: boolean;
  updated_at: string;
};

export type EmailLogRow = {
  id: string;
  ambassador_id: string;
  ambassador_name: string;
  template_slug: string | null;
  subject: string;
  to_email: string;
  status: 'sent' | 'failed';
  error: string | null;
  sent_at: string;
};

function renderPreview(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    if (v === undefined || v === null || v === '') return `<span style="color:#888">[${key}]</span>`;
    return v.replace(/[<&"']/g, (c) => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;', "'": '&#039;' }[c] ?? c));
  });
}

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

export function EmailsTab({
  ambassadors,
  templates,
  recentLogs,
}: {
  ambassadors: AmbassadorRow[];
  templates: EmailTemplate[];
  recentLogs: EmailLogRow[];
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [previewAmbId, setPreviewAmbId] = useState<string>('');
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const previewVars = useMemo(() => {
    const amb = ambassadors.find((a) => a.id === previewAmbId) ?? ambassadors[0];
    return {
      first_name: amb?.name.split(' ')[0] ?? 'Prénom',
      full_name: amb?.name ?? 'Nom complet',
      promo_code: amb?.promoCode ?? 'CODE',
      dashboard_url: amb ? `/fr/ambassadeur/${amb.promoCode.toLowerCase()}` : '#',
    };
  }, [previewAmbId, ambassadors]);

  const applyTemplate = (tid: string) => {
    setTemplateId(tid);
    const t = templates.find((x) => x.id === tid);
    if (t) {
      setSubject(t.subject);
      setBodyHtml(t.body_html);
    }
  };

  const toggleAmbassador = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === ambassadors.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(ambassadors.map((a) => a.id)));
  };

  const handleSend = () => {
    setFeedback(null);
    if (selectedIds.size === 0) {
      setFeedback({ kind: 'err', msg: 'Sélectionne au moins un ambassadeur.' });
      return;
    }
    if (!subject.trim() || !bodyHtml.trim()) {
      setFeedback({ kind: 'err', msg: 'Sujet et corps requis.' });
      return;
    }
    const recipientsWithoutEmail = ambassadors.filter(
      (a) => selectedIds.has(a.id) && !a.email,
    );
    if (recipientsWithoutEmail.length > 0) {
      const names = recipientsWithoutEmail.map((a) => a.name).join(', ');
      if (!confirm(`${recipientsWithoutEmail.length} ambassadeur(s) sans email seront ignorés: ${names}. Continuer ?`)) {
        return;
      }
    }
    startTransition(async () => {
      const res = await sendAmbassadorEmail({
        ambassadorIds: Array.from(selectedIds),
        templateId: templateId || undefined,
        subject,
        bodyHtml,
      });
      if (!res.ok) {
        setFeedback({ kind: 'err', msg: res.error });
        return;
      }
      setFeedback({
        kind: 'ok',
        msg: `Envoyé : ${res.sent}${res.failed > 0 ? ` · ${res.failed} échec(s)` : ''}`,
      });
      setSelectedIds(new Set());
    });
  };

  const previewSubject = renderPreview(subject, previewVars);
  const previewBody = renderPreview(bodyHtml, previewVars);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
      {/* Recipient picker */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: 14, height: 'fit-content',
        position: 'sticky', top: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Destinataires ({selectedIds.size}/{ambassadors.length})
          </div>
          <button onClick={toggleAll} style={btnSecondary}>
            {selectedIds.size === ambassadors.length ? 'Aucun' : 'Tous'}
          </button>
        </div>
        <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ambassadors.map((a) => (
            <label
              key={a.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                background: selectedIds.has(a.id) ? 'var(--accent-muted)' : 'transparent',
                border: `1px solid ${selectedIds.has(a.id) ? 'var(--accent-border)' : 'transparent'}`,
              }}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(a.id)}
                onChange={() => toggleAmbassador(a.id)}
                style={{ cursor: 'pointer' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.name}
                </div>
                <div style={{ fontSize: 11, color: a.email ? 'var(--text-3)' : 'var(--error)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.email ?? '(pas d\'email)'}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Composer + preview */}
      <div>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)', padding: 18, marginBottom: 16,
        }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Template</label>
            <select style={inputStyle} value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">— Email personnalisé (vide) —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.slug}{t.is_seeded ? ' · seed' : ''})</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Sujet</label>
            <input style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Sujet avec {{first_name}}..." />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
              Corps HTML — variables : {'{{first_name}}'} {'{{full_name}}'} {'{{promo_code}}'} {'{{dashboard_url}}'}
            </label>
            <textarea
              style={{ ...inputStyle, minHeight: 220, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              placeholder="<p>Bonjour {{first_name}}...</p>"
            />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={btnPrimary} onClick={handleSend} disabled={isPending}>
              {isPending ? 'Envoi…' : `Envoyer à ${selectedIds.size} ambassadeur${selectedIds.size > 1 ? 's' : ''}`}
            </button>
            {ambassadors.length > 0 && (
              <select
                style={{ ...inputStyle, width: 'auto' }}
                value={previewAmbId}
                onChange={(e) => setPreviewAmbId(e.target.value)}
              >
                <option value="">Preview : 1er destinataire</option>
                {ambassadors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            {feedback && (
              <span style={{
                fontSize: 13,
                color: feedback.kind === 'ok' ? 'var(--success)' : 'var(--error)',
                fontWeight: 500,
              }}>
                {feedback.msg}
              </span>
            )}
          </div>
        </div>

        {/* Preview */}
        {(subject || bodyHtml) && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 16,
          }}>
            <div style={{
              padding: '10px 16px', background: 'var(--surface-2)',
              borderBottom: '1px solid var(--border)', fontSize: 11,
              fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              Aperçu
            </div>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Sujet</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}
                dangerouslySetInnerHTML={{ __html: previewSubject }} />
            </div>
            <iframe
              srcDoc={`<div style="font-family:-apple-system,sans-serif;color:#222;padding:18px;max-width:560px;line-height:1.55">${previewBody}</div>`}
              sandbox=""
              style={{ width: '100%', minHeight: 360, border: 'none', background: '#fafafa' }}
              title="preview"
            />
          </div>
        )}

        {/* Recent logs */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 16px', background: 'var(--surface-2)',
            borderBottom: '1px solid var(--border)', fontSize: 11,
            fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em',
          }}>
            Historique récent
          </div>
          {recentLogs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Aucun envoi pour l&apos;instant.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <tbody>
                {recentLogs.map((log, i) => (
                  <tr key={log.id} style={{ borderBottom: i < recentLogs.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <td style={{ padding: '8px 14px', color: 'var(--text-3)', whiteSpace: 'nowrap', width: 130 }}>
                      {new Date(log.sent_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '8px 14px', color: 'var(--text)', fontWeight: 500 }}>{log.ambassador_name}</td>
                    <td style={{ padding: '8px 14px', color: 'var(--text-2)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.subject}</td>
                    <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 600,
                        background: log.status === 'sent' ? 'var(--success-bg)' : 'var(--error-bg)',
                        color: log.status === 'sent' ? 'var(--success)' : 'var(--error)',
                      }}>{log.status === 'sent' ? '● Envoyé' : '● Échec'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
