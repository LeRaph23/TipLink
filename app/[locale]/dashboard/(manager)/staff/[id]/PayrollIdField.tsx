'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { updateStaffPayrollId } from '@/actions/staff';

/**
 * The employee's matricule in the payroll software: the key of the payroll
 * import file. Saved on its own, apart from the name and photo form, because
 * it lives in a managers-only table (00094) and has nothing to do with what
 * customers see.
 */
export function PayrollIdField({ staffId, initial }: { staffId: string; initial: string | null }) {
  const t = useTranslations('dashboard.staff.detail');
  const [value, setValue] = useState(initial ?? '');
  const [saved, setSaved] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await updateStaffPayrollId(staffId, value.trim() || null);
    setBusy(false);
    if ('error' in res) {
      setMessage({ ok: false, text: res.error });
      return;
    }
    setSaved(value.trim());
    setMessage({ ok: true, text: t('payrollIdSaved') });
  };

  const unchanged = value.trim() === saved;

  return (
    <form onSubmit={save} style={{ marginTop: 28, paddingTop: 22, borderTop: '1px solid var(--border-subtle)' }}>
      <label htmlFor="payroll-id" style={{
        display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
      }}>
        {t('payrollId')}
      </label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          id="payroll-id"
          type="text"
          value={value}
          maxLength={32}
          onChange={(e) => setValue(e.target.value)}
          placeholder="00042"
          autoComplete="off"
          style={{
            flex: '1 1 160px', minWidth: 0, padding: '9px 12px', borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-2)', border: '1.5px solid var(--border)',
            color: 'var(--text)', fontSize: 13.5, fontFamily: 'var(--font)',
          }}
        />
        <button
          type="submit"
          disabled={busy || unchanged}
          className="btn-ghost"
          style={{
            minHeight: 40, padding: '0 16px', borderRadius: 'var(--radius)',
            background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)',
            fontSize: 13, fontWeight: 600, cursor: busy || unchanged ? 'default' : 'pointer',
            opacity: busy || unchanged ? 0.55 : 1,
          }}
        >
          {t('payrollIdSave')}
        </button>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>{t('payrollIdHint')}</p>
      {message && (
        <p style={{ fontSize: 12.5, marginTop: 6, color: message.ok ? 'var(--success)' : 'var(--error)' }}>{message.text}</p>
      )}
    </form>
  );
}
