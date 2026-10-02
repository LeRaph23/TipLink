'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { HELP, HELP_CONTACT, type HelpCategory } from '@/content/aide';

// Accents and case do not matter when searching: "expire" finds "expiré".
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function matches(q: string, ...texts: (string | undefined)[]) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  const hay = norm(texts.filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
}

/** `intro` is shown under the topics while nothing is being searched. */
export function HelpCenter({ intro }: { intro?: ReactNode }) {
  const [query, setQuery] = useState('');

  const visible: HelpCategory[] = useMemo(() => {
    if (!query.trim()) return HELP;
    return HELP.map((c) => ({
      ...c,
      entries: c.entries.filter((e) => matches(query, c.title, e.question, e.answer, ...(e.steps ?? []))),
    })).filter((c) => c.entries.length > 0);
  }, [query]);

  const searching = query.trim().length > 0;

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <span aria-hidden="true" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--text-3)' }}>⌕</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Où êtes-vous bloqué ? code, NFC, Stripe…"
          aria-label="Rechercher dans l’aide"
          style={{
            width: '100%', padding: '15px 16px 15px 42px', borderRadius: 14,
            border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
            fontSize: 16, fontFamily: 'var(--font)', outline: 'none',
          }}
        />
      </div>

      {!searching && (
        <nav aria-label="Thèmes" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
          {HELP.map((c) => (
            <a key={c.id} href={`#${c.id}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 999,
              background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)',
              fontSize: 14, fontWeight: 600, textDecoration: 'none',
            }}>
              <span aria-hidden="true">{c.icon}</span>{c.title}
            </a>
          ))}
        </nav>
      )}

      {!searching && intro}

      {visible.length === 0 && (
        <p style={{ padding: '28px 20px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 15 }}>
          Aucune réponse ne correspond. Écrivez-nous à{' '}
          <a href={`mailto:${HELP_CONTACT}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>{HELP_CONTACT}</a>{' '}
          en décrivant l’écran où vous êtes bloqué : nous répondons sous 48 heures ouvrées.
        </p>
      )}

      {visible.map((c) => (
        <section key={c.id} id={c.id} style={{ marginBottom: 36, scrollMarginTop: 20 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12 }}>
            <span aria-hidden="true">{c.icon}</span>{c.title}
          </h2>
          <div style={{ borderRadius: 16, border: '1px solid var(--border)', background: 'var(--surface)', overflow: 'hidden' }}>
            {c.entries.map((e, i) => (
              <details key={e.id} id={e.id} open={searching && visible.reduce((n, x) => n + x.entries.length, 0) <= 3}
                style={{ borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
                <summary style={{ padding: '16px 18px', cursor: 'pointer', fontSize: 15.5, fontWeight: 650, lineHeight: 1.4, listStyle: 'none', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span aria-hidden="true" className="help-chevron" style={{ color: 'var(--accent)', fontWeight: 800, flexShrink: 0, transition: 'transform 150ms' }}>›</span>
                  <span>{e.question}</span>
                </summary>
                <div style={{ padding: '0 18px 18px 38px', fontSize: 15, lineHeight: 1.65, color: 'var(--text-2)' }}>
                  <p>{e.answer}</p>
                  {e.steps && (
                    <ol style={{ margin: '10px 0 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
                      {e.steps.map((s) => <li key={s}>{s}</li>)}
                    </ol>
                  )}
                  {e.link && (
                    <a href={e.link.href} style={{ display: 'inline-block', marginTop: 12, color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>
                      {e.link.label} →
                    </a>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <style>{`
        details[open] > summary .help-chevron { transform: rotate(90deg); }
        details > summary::-webkit-details-marker { display: none; }
      `}</style>
    </div>
  );
}
