'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  type ProspectRow,
  type ProspectStatus,
  type ColdTargetProgram,
  updateProspect,
  createManualProspect,
  deleteProspect,
} from '@/actions/admin/cold-email';

const PROGRAM_META: Record<ColdTargetProgram, { label: string; short: string; color: string; bg: string }> = {
  ambassador: { label: 'Ambassadeur',     short: 'AMB', color: '#15803d', bg: '#dcfce7' },
  commercial: { label: 'Commercial Pro',  short: 'PRO', color: '#a16207', bg: '#fef3c7' },
};

const STATUS_OPTIONS: { value: ProspectStatus; label: string; color: string; bg: string }[] = [
  { value: 'not_contacted', label: 'Non contacté', color: '#64748b', bg: '#f1f5f9' },
  { value: 'contacted',     label: 'Contacté',     color: '#0369a1', bg: '#e0f2fe' },
  { value: 'in_discussion', label: 'En discussion', color: '#a16207', bg: '#fef3c7' },
  { value: 'accepted',      label: 'Accepté',      color: '#15803d', bg: '#dcfce7' },
  { value: 'refused',       label: 'Refusé',       color: '#b91c1c', bg: '#fee2e2' },
];

function statusMeta(s: ProspectStatus) {
  return STATUS_OPTIONS.find(o => o.value === s) ?? STATUS_OPTIONS[0];
}

type Filter = 'all' | ProspectStatus;

type ProgramFilter = 'all' | ColdTargetProgram;

export function ProspectsTable({ initial }: { initial: ProspectRow[] }) {
  const [rows, setRows] = useState<ProspectRow[]>(initial);
  const [filter, setFilter] = useState<Filter>('all');
  const [programFilter, setProgramFilter] = useState<ProgramFilter>('all');
  const [query, setQuery] = useState('');
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (programFilter !== 'all' && r.target_program !== programFilter) return false;
      if (!q) return true;
      return (
        (r.company_name ?? '').toLowerCase().includes(q) ||
        (r.first_name ?? '').toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.city ?? '').toLowerCase().includes(q) ||
        (r.notes ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, filter, programFilter, query]);

  const counts = useMemo(() => {
    const inScope = programFilter === 'all' ? rows : rows.filter(r => r.target_program === programFilter);
    const c: Record<Filter, number> = { all: inScope.length, not_contacted: 0, contacted: 0, in_discussion: 0, accepted: 0, refused: 0 };
    for (const r of inScope) c[r.status]++;
    return c;
  }, [rows, programFilter]);

  const programCounts = useMemo(() => {
    const c: Record<ProgramFilter, number> = { all: rows.length, ambassador: 0, commercial: 0 };
    for (const r of rows) c[r.target_program]++;
    return c;
  }, [rows]);

  function patchRow(id: string, patch: Partial<ProspectRow>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  function commit(id: string, patch: Parameters<typeof updateProspect>[1]) {
    setError(null);
    startTransition(async () => {
      const res = await updateProspect(id, patch);
      if (!res.ok) setError(res.error);
    });
  }

  function handleStatus(id: string, status: ProspectStatus) {
    patchRow(id, { status });
    commit(id, { status });
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce prospect ?')) return;
    setError(null);
    const res = await deleteProspect(id);
    if (!res.ok) { setError(res.error); return; }
    setRows(prev => prev.filter(r => r.id !== id));
  }

  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>
          Tableau de suivi
        </h2>
        <AddProspectForm onAdded={(row) => setRows(prev => [row, ...prev])} />
      </div>

      {/* Program filter (row 1) — separate dimension from status filter (row 2). */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Programme</span>
        <FilterChip active={programFilter === 'all'} onClick={() => setProgramFilter('all')} label={`Tous · ${programCounts.all}`} />
        <FilterChip
          active={programFilter === 'ambassador'}
          onClick={() => setProgramFilter('ambassador')}
          label={`Ambassadeur · ${programCounts.ambassador}`}
          color={PROGRAM_META.ambassador.color}
          bg={PROGRAM_META.ambassador.bg}
        />
        <FilterChip
          active={programFilter === 'commercial'}
          onClick={() => setProgramFilter('commercial')}
          label={`Commercial Pro · ${programCounts.commercial}`}
          color={PROGRAM_META.commercial.color}
          bg={PROGRAM_META.commercial.bg}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Statut</span>
        <FilterChip active={filter === 'all'}        onClick={() => setFilter('all')}        label={`Tous · ${counts.all}`}      />
        {STATUS_OPTIONS.map(o => (
          <FilterChip
            key={o.value}
            active={filter === o.value}
            onClick={() => setFilter(o.value)}
            label={`${o.label} · ${counts[o.value]}`}
            color={o.color}
            bg={o.bg}
          />
        ))}
        <input
          type="search"
          placeholder="Recherche…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            marginLeft: 'auto',
            background: 'var(--surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)', padding: '6px 10px', fontSize: 12.5,
            color: 'var(--text)', minWidth: 200, fontFamily: 'var(--font)',
          }}
        />
      </div>

      {error && (
        <div style={{ padding: 10, marginBottom: 10, background: '#fee2e2', color: '#b91c1c', borderRadius: 8, fontSize: 12.5 }}>
          {error}
        </div>
      )}

      <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontFamily: 'var(--font)' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
              <Th>Programme</Th>
              <Th>Entreprise</Th>
              <Th>Prénom</Th>
              <Th>Email</Th>
              <Th>LinkedIn</Th>
              <Th>Ville</Th>
              <Th>Séquence</Th>
              <Th>Notes</Th>
              <Th>Statut</Th>
              <Th>—</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>Aucun prospect.</td></tr>
            )}
            {filtered.map(r => {
              const pm = PROGRAM_META[r.target_program];
              const seqLabel = r.unsubscribed_at
                ? 'Désinscrit'
                : r.replied_at
                  ? 'Répondu'
                  : `Étape ${r.sequence_step}/3`;
              return (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <Td>
                  <span title={pm.label} style={{
                    padding: '3px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 700,
                    background: pm.bg, color: pm.color, fontFamily: 'monospace', letterSpacing: '0.04em',
                  }}>{pm.short}</span>
                </Td>
                <Td>
                  <InlineText value={r.company_name ?? ''} placeholder="—" onCommit={v => { patchRow(r.id, { company_name: v || null }); commit(r.id, { company_name: v || null }); }} />
                </Td>
                <Td>
                  <InlineText value={r.first_name ?? ''} placeholder="—" onCommit={v => { patchRow(r.id, { first_name: v || null }); commit(r.id, { first_name: v || null }); }} />
                </Td>
                <Td>
                  <InlineText
                    value={r.email ?? ''}
                    placeholder="email@…"
                    type="email"
                    onCommit={v => { patchRow(r.id, { email: v || null }); commit(r.id, { email: v || null }); }}
                  />
                </Td>
                <Td>
                  <LinkedInCell
                    value={r.linkedin_url ?? ''}
                    onCommit={v => { patchRow(r.id, { linkedin_url: v || null }); commit(r.id, { linkedin_url: v || null }); }}
                  />
                </Td>
                <Td>
                  <span style={{ color: 'var(--text-2)' }}>{r.city ?? '—'}</span>
                </Td>
                <Td>
                  <span title={r.last_sent_at ? `Dernier envoi : ${new Date(r.last_sent_at).toLocaleString('fr-FR')}` : 'Jamais envoyé'}
                    style={{ fontSize: 11, color: r.unsubscribed_at ? 'var(--error)' : r.replied_at ? 'var(--success)' : 'var(--text-3)', fontWeight: 600 }}>
                    {seqLabel}
                  </span>
                </Td>
                <Td>
                  <InlineText value={r.notes ?? ''} placeholder="…" wide onCommit={v => { patchRow(r.id, { notes: v || null }); commit(r.id, { notes: v || null }); }} />
                </Td>
                <Td>
                  <StatusToggle value={r.status} onChange={s => handleStatus(r.id, s)} />
                </Td>
                <Td>
                  <button
                    onClick={() => handleDelete(r.id)}
                    title="Supprimer"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 14, padding: 4 }}
                  >×</button>
                </Td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '10px 12px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '8px 12px', verticalAlign: 'middle', color: 'var(--text)' }}>{children}</td>;
}

function FilterChip({ active, onClick, label, color, bg }: { active: boolean; onClick: () => void; label: string; color?: string; bg?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 10px', borderRadius: 999,
        border: '1px solid ' + (active ? (color ?? 'var(--accent)') : 'var(--border-subtle)'),
        background: active ? (bg ?? 'var(--accent-muted)') : 'var(--surface)',
        color: active ? (color ?? 'var(--accent)') : 'var(--text-2)',
        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
        transition: 'all 120ms',
      }}
    >{label}</button>
  );
}

function StatusToggle({ value, onChange }: { value: ProspectStatus; onChange: (s: ProspectStatus) => void }) {
  const [open, setOpen] = useState(false);
  const meta = statusMeta(value);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
          background: meta.bg, color: meta.color, fontSize: 11.5, fontWeight: 600,
          fontFamily: 'var(--font)', display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        {meta.label}
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4l4 4 4-4" /></svg>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 41,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)',
            padding: 4, minWidth: 160,
          }}>
            {STATUS_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: value === o.value ? 'var(--surface-2)' : 'transparent',
                  textAlign: 'left', fontSize: 12.5, fontFamily: 'var(--font)', color: 'var(--text)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: o.color }} />
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function InlineText({
  value, onCommit, placeholder, type, wide,
}: {
  value: string; onCommit: (v: string) => void; placeholder?: string; type?: string; wide?: boolean;
}) {
  const [local, setLocal] = useState(value);
  const dirty = local !== value;
  return (
    <input
      type={type ?? 'text'}
      value={local}
      placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (dirty) onCommit(local); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setLocal(value); }}
      style={{
        background: 'transparent', border: '1px solid transparent', borderRadius: 6,
        padding: '4px 6px', fontSize: 12.5, color: 'var(--text)', fontFamily: 'var(--font)',
        width: wide ? 220 : 140, minWidth: 0, outline: 'none',
        transition: 'background 120ms, border-color 120ms',
      }}
      onFocus={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
      onMouseLeave={e => { if (document.activeElement !== e.currentTarget) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; } }}
    />
  );
}

function LinkedInCell({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  if (editing) {
    return (
      <input
        autoFocus
        value={local}
        placeholder="https://linkedin.com/in/…"
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { onCommit(local); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setLocal(value); setEditing(false); } }}
        style={{
          background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 6,
          padding: '4px 6px', fontSize: 12.5, color: 'var(--text)', fontFamily: 'var(--font)',
          width: 220, outline: 'none',
        }}
      />
    );
  }

  if (value) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <a href={value} target="_blank" rel="noreferrer" style={{ color: '#0a66c2', fontSize: 12.5, textDecoration: 'underline', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value.replace(/^https?:\/\/(www\.)?linkedin\.com\//i, '')}
        </a>
        <button onClick={() => setEditing(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11, padding: 2 }} title="Modifier">✎</button>
      </span>
    );
  }
  return (
    <button onClick={() => setEditing(true)} style={{ background: 'transparent', border: '1px dashed var(--border-subtle)', borderRadius: 6, padding: '3px 8px', color: 'var(--text-3)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'var(--font)' }}>
      + LinkedIn
    </button>
  );
}

function AddProspectForm({ onAdded }: { onAdded: (r: ProspectRow) => void }) {
  const [open, setOpen] = useState(false);
  const [program, setProgram] = useState<ColdTargetProgram>('ambassador');
  const [form, setForm] = useState({ company_name: '', first_name: '', email: '', linkedin_url: '', city: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    const res = await createManualProspect({ ...form, targetProgram: program });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onAdded({
      id: res.id,
      siret: null,
      company_name: form.company_name || null,
      first_name: form.first_name || null,
      email: form.email || null,
      linkedin_url: form.linkedin_url || null,
      city: form.city || null,
      notes: form.notes || null,
      naf_code: null,
      creation_date: null,
      imported_at: new Date().toISOString(),
      status: 'not_contacted',
      target_program: program,
      sequence_step: 0,
      last_sent_at: null,
      unsubscribed_at: null,
      replied_at: null,
    });
    setForm({ company_name: '', first_name: '', email: '', linkedin_url: '', city: '', notes: '' });
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '7px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
          background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontSize: 12.5,
          fontWeight: 600, fontFamily: 'var(--font)',
        }}
      >+ Ajouter un prospect</button>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 8 }}>
      <select
        value={program}
        onChange={e => setProgram(e.target.value as ColdTargetProgram)}
        style={{
          background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 6,
          padding: '5px 8px', fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none',
        }}
      >
        <option value="ambassador">Ambassadeur</option>
        <option value="commercial">Commercial Pro</option>
      </select>
      <Inp v={form.company_name}   p="Entreprise"   o={v => setForm({ ...form, company_name: v })} />
      <Inp v={form.first_name}     p="Prénom"       o={v => setForm({ ...form, first_name: v })} />
      <Inp v={form.email}          p="Email"        o={v => setForm({ ...form, email: v })} />
      <Inp v={form.linkedin_url}   p="LinkedIn URL" o={v => setForm({ ...form, linkedin_url: v })} wide />
      <Inp v={form.city}           p="Ville"        o={v => setForm({ ...form, city: v })} />
      <Inp v={form.notes}          p="Notes"        o={v => setForm({ ...form, notes: v })} wide />
      <button
        onClick={submit}
        disabled={busy}
        style={{ padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: '#fff', cursor: busy ? 'wait' : 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)' }}
      >{busy ? '…' : 'Ajouter'}</button>
      <button onClick={() => { setOpen(false); setErr(null); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, padding: 6 }}>annuler</button>
      {err && <span style={{ color: '#b91c1c', fontSize: 11.5, width: '100%' }}>{err}</span>}
    </div>
  );
}

function Inp({ v, p, o, wide }: { v: string; p: string; o: (v: string) => void; wide?: boolean }) {
  return (
    <input
      value={v}
      placeholder={p}
      onChange={e => o(e.target.value)}
      style={{
        background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 6,
        padding: '5px 8px', fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font)',
        width: wide ? 180 : 120, outline: 'none',
      }}
    />
  );
}
