'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  generateBatch,
  assignTagsToEstablishment,
  assignTagsByShortIdRange,
  unassignTag,
} from '@/actions/admin/smarttags';

type StockTag = {
  id: string;
  short_id: string;
  batch_label: string | null;
  generated_at: string;
};

type ActiveTag = StockTag & {
  establishment_id: string | null;
  establishment_name: string | null;
  group_name: string | null;
};

type Establishment = {
  id: string;
  name: string;
  group_name: string | null;
};

type Props = {
  locale: string;
  stock: StockTag[];
  active: ActiveTag[];
  establishments: Establishment[];
};

const primaryBtn: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--accent)',
  border: '1px solid var(--accent)',
  color: 'var(--accent-contrast, #fff)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'var(--font)',
};

const secondaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'var(--font)',
};

const ghostBtn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  background: 'transparent',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-2)',
  fontSize: 11.5,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'var(--font)',
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 13,
  fontFamily: 'var(--font)',
};

const th: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  borderBottom: '1px solid var(--border)',
  background: 'var(--surface-2)',
};

const td: React.CSSProperties = {
  padding: '10px 14px',
  color: 'var(--text)',
  fontSize: 13,
  borderBottom: '1px solid var(--border-subtle)',
  verticalAlign: 'middle',
};

export function SmartTagsManager({ locale, stock, active, establishments }: Props) {
  const t = useTranslations('dashboard.admin.smarttags');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<'stock' | 'active'>('stock');
  const [genOpen, setGenOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchFilter, setBatchFilter] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const batches = useMemo(() => {
    const set = new Map<string, number>();
    for (const s of stock) {
      const key = s.batch_label ?? '—';
      set.set(key, (set.get(key) ?? 0) + 1);
    }
    return Array.from(set.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [stock]);

  const filteredStock = useMemo(() => {
    if (!batchFilter) return stock;
    return stock.filter((s) => (s.batch_label ?? '—') === batchFilter);
  }, [stock, batchFilter]);

  const filteredActive = useMemo(() => {
    const q = activeFilter.trim().toLowerCase();
    if (!q) return active;
    return active.filter((a) =>
      (a.establishment_name ?? '').toLowerCase().includes(q) ||
      (a.group_name ?? '').toLowerCase().includes(q) ||
      a.short_id.toLowerCase().includes(q)
    );
  }, [active, activeFilter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: string[]) {
    setSelected((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function flash(err: string) {
    setError(err);
    setTimeout(() => setError(null), 5000);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
            {t('title')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{t('subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={primaryBtn} onClick={() => setGenOpen(true)} disabled={pending}>
            {t('generateBatch')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-subtle)', marginBottom: 18 }}>
        {(['stock', 'active'] as const).map((k) => {
          const isActive = tab === k;
          const count = k === 'stock' ? stock.length : active.length;
          return (
            <button
              key={k}
              onClick={() => { setTab(k); setSelected(new Set()); }}
              style={{
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                color: isActive ? 'var(--text)' : 'var(--text-3)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {t(`tab.${k}`)} <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ padding: 10, marginBottom: 12, borderRadius: 'var(--radius-sm)', background: 'var(--error-bg)', color: 'var(--error)', fontSize: 12 }}>
          {error}
        </div>
      )}
      {toast && (
        <div style={{ padding: 10, marginBottom: 12, borderRadius: 'var(--radius-sm)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: 12 }}>
          {toast}
        </div>
      )}

      {tab === 'stock' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              style={{ ...input, width: 260 }}
            >
              <option value="">{t('filterAllBatches')}</option>
              {batches.map(([label, count]) => (
                <option key={label} value={label}>{label} · {count}</option>
              ))}
            </select>

            {batchFilter && batchFilter !== '—' && (
              <>
                <a
                  href={`/api/admin/smarttags/batch/${encodeURIComponent(batchFilter)}/export.csv`}
                  style={{ ...secondaryBtn, textDecoration: 'none', display: 'inline-block' }}
                >
                  {t('exportCsv')}
                </a>
                <a
                  href={`/api/admin/smarttags/batch/${encodeURIComponent(batchFilter)}/export-urls`}
                  style={{ ...secondaryBtn, textDecoration: 'none', display: 'inline-block' }}
                >
                  {t('exportUrlsTxt')}
                </a>
              </>
            )}

            <div style={{ flex: 1 }} />

            <button
              type="button"
              style={{
                ...secondaryBtn,
                ...(selected.size === 0 || pending
                  ? { opacity: 0.5, cursor: 'not-allowed' as const }
                  : {}),
              }}
              title={selected.size === 0 ? t('assignNeedsSelection') : undefined}
              disabled={selected.size === 0 || pending}
              onClick={() => setAssignOpen(true)}
            >
              {t('assignSelected', { n: selected.size })}
            </button>
            <button
              style={secondaryBtn}
              disabled={pending}
              onClick={() => setRangeOpen(true)}
            >
              {t('assignRange')}
            </button>
          </div>

          <TagTable
            rows={filteredStock}
            selected={selected}
            onToggle={toggle}
            onToggleAll={() => toggleAll(filteredStock.map((s) => s.id))}
            locale={locale}
            mode="stock"
            t={t}
          />
        </div>
      )}

      {tab === 'active' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
            <input
              placeholder={t('searchActive')}
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              style={{ ...input, maxWidth: 360 }}
            />
          </div>
          <ActiveTable
            rows={filteredActive}
            locale={locale}
            pending={pending}
            onUnassign={(id) => {
              startTransition(async () => {
                const res = await unassignTag(id);
                if (!res.ok) flash(res.error);
                else { notify(t('unassigned')); router.refresh(); }
              });
            }}
            t={t}
          />
        </div>
      )}

      {genOpen && (
        <GenerateModal
          onClose={() => setGenOpen(false)}
          onSubmit={(count, label) => {
            startTransition(async () => {
              const res = await generateBatch(count, label || undefined);
              if (!res.ok) flash(res.error);
              else {
                notify(t('generated', { n: res.data.short_ids.length, label: res.data.batch_label }));
                setBatchFilter(res.data.batch_label);
                setGenOpen(false);
                router.refresh();
              }
            });
          }}
          pending={pending}
          t={t}
        />
      )}

      {assignOpen && (
        <AssignModal
          title={t('assignSelectedTitle', { n: selected.size })}
          establishments={establishments}
          onClose={() => setAssignOpen(false)}
          onSubmit={(estId) => {
            const ids = Array.from(selected);
            startTransition(async () => {
              const res = await assignTagsToEstablishment(ids, estId);
              if (!res.ok) flash(res.error);
              else {
                notify(t('assigned', { n: res.data.updated }));
                setSelected(new Set());
                setAssignOpen(false);
                router.refresh();
              }
            });
          }}
          pending={pending}
          t={t}
        />
      )}

      {rangeOpen && (
        <RangeModal
          establishments={establishments}
          onClose={() => setRangeOpen(false)}
          onSubmit={(first, last, estId) => {
            startTransition(async () => {
              const res = await assignTagsByShortIdRange(first, last, estId);
              if (!res.ok) flash(res.error);
              else {
                notify(t('assigned', { n: res.data.updated }));
                setRangeOpen(false);
                router.refresh();
              }
            });
          }}
          pending={pending}
          t={t}
        />
      )}
    </div>
  );
}

function TagTable({
  rows, selected, onToggle, onToggleAll, locale, t,
}: {
  rows: StockTag[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  locale: string;
  mode: 'stock';
  t: ReturnType<typeof useTranslations<'dashboard.admin.smarttags'>>;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  if (rows.length === 0) {
    return (
      <div style={{
        padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13,
        background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)',
      }}>
        {t('stockEmpty')}
      </div>
    );
  }
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 40 }}>
              <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
            </th>
            <th style={th}>{t('colShortId')}</th>
            <th style={th}>{t('colBatch')}</th>
            <th style={th}>{t('colGenerated')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={td}>
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => onToggle(r.id)} />
              </td>
              <td style={{ ...td, fontFamily: 'var(--font-mono, monospace)' }}>{r.short_id}</td>
              <td style={td}>{r.batch_label ?? '—'}</td>
              <td style={{ ...td, color: 'var(--text-3)' }}>
                {new Date(r.generated_at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActiveTable({
  rows, locale, pending, onUnassign, t,
}: {
  rows: ActiveTag[];
  locale: string;
  pending: boolean;
  onUnassign: (id: string) => void;
  t: ReturnType<typeof useTranslations<'dashboard.admin.smarttags'>>;
}) {
  if (rows.length === 0) {
    return (
      <div style={{
        padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13,
        background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)',
      }}>
        {t('activeEmpty')}
      </div>
    );
  }
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>{t('colShortId')}</th>
            <th style={th}>{t('colEstablishment')}</th>
            <th style={th}>{t('colGroup')}</th>
            <th style={th}>{t('colBatch')}</th>
            <th style={{ ...th, textAlign: 'right' }}>{t('colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ ...td, fontFamily: 'var(--font-mono, monospace)' }}>{r.short_id}</td>
              <td style={td}>{r.establishment_name ?? '—'}</td>
              <td style={{ ...td, color: 'var(--text-2)' }}>{r.group_name ?? '—'}</td>
              <td style={{ ...td, color: 'var(--text-3)' }}>{r.batch_label ?? '—'}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                <button style={ghostBtn} disabled={pending} onClick={() => onUnassign(r.id)}>
                  {t('unassign')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* silence unused locale warning if any */}
      <div style={{ display: 'none' }} aria-hidden>{locale}</div>
    </div>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const overlay = (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 10050,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 22,
          width: '100%',
          maxWidth: 460,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>{title}</h2>
        {children}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

function GenerateModal({ onClose, onSubmit, pending, t }: {
  onClose: () => void;
  onSubmit: (count: number, label: string) => void;
  pending: boolean;
  t: ReturnType<typeof useTranslations<'dashboard.admin.smarttags'>>;
}) {
  const [count, setCount] = useState(100);
  const [label, setLabel] = useState('');
  return (
    <ModalShell title={t('generateTitle')} onClose={onClose}>
      <label style={{ display: 'block', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{t('count')}</div>
        <input
          type="number"
          min={1}
          max={5000}
          value={count}
          onChange={(e) => setCount(parseInt(e.target.value, 10) || 0)}
          style={input}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{t('labelOptional')}</div>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="2026-04-23-A"
          style={input}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button style={secondaryBtn} onClick={onClose} disabled={pending}>{t('cancel')}</button>
        <button style={primaryBtn} onClick={() => onSubmit(count, label)} disabled={pending || count < 1}>
          {pending ? t('working') : t('generateConfirm')}
        </button>
      </div>
    </ModalShell>
  );
}

function AssignModal({
  title, establishments, onClose, onSubmit, pending, t,
}: {
  title: string;
  establishments: Establishment[];
  onClose: () => void;
  onSubmit: (establishmentId: string) => void;
  pending: boolean;
  t: ReturnType<typeof useTranslations<'dashboard.admin.smarttags'>>;
}) {
  const [estId, setEstId] = useState('');
  const noEst = establishments.length === 0;
  return (
    <ModalShell title={title} onClose={onClose}>
      {noEst ? (
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 18 }}>{t('noEstablishments')}</p>
      ) : (
        <label style={{ display: 'block', marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{t('targetEstablishment')}</div>
          <select value={estId} onChange={(e) => setEstId(e.target.value)} style={input}>
            <option value="">—</option>
            {establishments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}{e.group_name ? ` · ${e.group_name}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" style={secondaryBtn} onClick={onClose} disabled={pending}>{t('cancel')}</button>
        <button type="button" style={primaryBtn} onClick={() => onSubmit(estId)} disabled={noEst || !estId || pending}>
          {pending ? t('working') : t('assignConfirm')}
        </button>
      </div>
    </ModalShell>
  );
}

function RangeModal({
  establishments, onClose, onSubmit, pending, t,
}: {
  establishments: Establishment[];
  onClose: () => void;
  onSubmit: (first: string, last: string, estId: string) => void;
  pending: boolean;
  t: ReturnType<typeof useTranslations<'dashboard.admin.smarttags'>>;
}) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [estId, setEstId] = useState('');
  const noEst = establishments.length === 0;
  const can = first.trim() && last.trim() && estId && !noEst;
  return (
    <ModalShell title={t('rangeTitle')} onClose={onClose}>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
        {t('rangeHelp')}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <label>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{t('firstShortId')}</div>
          <input value={first} onChange={(e) => setFirst(e.target.value)} style={input} disabled={noEst} />
        </label>
        <label>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{t('lastShortId')}</div>
          <input value={last} onChange={(e) => setLast(e.target.value)} style={input} disabled={noEst} />
        </label>
      </div>
      {noEst ? (
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 18 }}>{t('noEstablishments')}</p>
      ) : (
        <label style={{ display: 'block', marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{t('targetEstablishment')}</div>
          <select value={estId} onChange={(e) => setEstId(e.target.value)} style={input}>
            <option value="">—</option>
            {establishments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}{e.group_name ? ` · ${e.group_name}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" style={secondaryBtn} onClick={onClose} disabled={pending}>{t('cancel')}</button>
        <button type="button" style={primaryBtn} onClick={() => onSubmit(first, last, estId)} disabled={!can || pending}>
          {pending ? t('working') : t('assignConfirm')}
        </button>
      </div>
    </ModalShell>
  );
}
