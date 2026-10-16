'use client';

import { useRef, useState, useTransition } from 'react';
import { MAX_ATTACHMENTS, MAX_ATTACHMENTS_BYTES } from '@/lib/admin/email-attachments';
import { sendAdminDirectEmail } from '@/actions/admin/emails';

const primaryBtn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 'var(--radius-sm)',
  background: 'var(--accent)', border: '1px solid var(--accent)',
  color: 'var(--accent-contrast, #fff)', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--font)',
};
const secondaryBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--font)',
};
const input: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)',
};

// Free-text email to any address, sent from contact@. The order page can only
// write to that order's customer; this reaches everyone else.
export function DirectEmailComposer() {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const filesBytes = files.reduce((sum, f) => sum + f.size, 0);
  const filesTooBig = files.length > MAX_ATTACHMENTS || filesBytes > MAX_ATTACHMENTS_BYTES;
  const canSend = !pending && !filesTooBig && to.includes('@') && subject.trim().length >= 3 && body.trim().length >= 5;

  function send() {
    setNotice(null);
    startTransition(async () => {
      const form = new FormData();
      for (const f of files) form.append('files', f);
      const res = await sendAdminDirectEmail(to, subject, body, form);
      if (!res.ok) {
        setNotice({ tone: 'error', text: res.error });
        return;
      }
      setNotice({ tone: 'success', text: `Email envoyé à ${res.data.to}.` });
      setTo('');
      setSubject('');
      setBody('');
      setFiles([]);
    });
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 16, marginBottom: 26, display: 'grid', gap: 8,
    }}>
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Écrire un email</h2>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '3px 0 0' }}>
          À n&apos;importe quelle adresse, envoyé depuis contact@digitip.app. La réponse arrive sur contact@.
        </p>
      </div>
      <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Destinataire" style={input} />
      <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Objet" style={input} />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={'Bonjour,\n\nUne ligne vide sépare les paragraphes. Les liens deviennent cliquables.'}
        rows={8}
        style={{ ...input, resize: 'vertical' }}
      />
      <div style={{ display: 'grid', gap: 6 }}>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            setFiles((prev) => [...prev, ...picked.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
            e.target.value = '';
          }}
        />
        <div>
          <button type="button" style={secondaryBtn} disabled={pending} onClick={() => fileInput.current?.click()}>
            Joindre des fichiers
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 8 }}>
            PDF, image, TXT ou CSV · {MAX_ATTACHMENTS} fichiers et 4 Mo max
          </span>
        </div>
        {files.map((f) => (
          <div key={`${f.name}-${f.size}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span>📎 {f.name}</span>
            <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{Math.max(1, Math.round(f.size / 1024))} Ko</span>
            <button
              type="button"
              aria-label={`Retirer ${f.name}`}
              style={{ ...secondaryBtn, padding: '2px 8px' }}
              disabled={pending}
              onClick={() => setFiles((prev) => prev.filter((p) => p !== f))}
            >
              ×
            </button>
          </div>
        ))}
        {filesTooBig && (
          <div style={{ fontSize: 12, color: 'var(--danger, #dc2626)' }}>
            Trop de fichiers ou trop lourds : {MAX_ATTACHMENTS} fichiers et 4 Mo au total maximum.
          </div>
        )}
      </div>
      {notice && (
        <div role="status" style={{ fontSize: 13, color: notice.tone === 'success' ? 'var(--success)' : 'var(--danger, #dc2626)' }}>
          {notice.text}
        </div>
      )}
      <div>
        <button type="button" style={{ ...primaryBtn, opacity: canSend ? 1 : 0.5 }} disabled={!canSend} onClick={send}>
          {pending ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </div>
  );
}
