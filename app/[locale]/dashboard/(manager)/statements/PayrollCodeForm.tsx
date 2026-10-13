'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { updateGroup } from '@/actions/group';

/** The pay-item code written into the payroll import file. */
export function PayrollCodeForm({ groupId, initial }: { groupId: string; initial: string }) {
  const t = useTranslations('dashboard.statements');
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await updateGroup({ groupId, payrollCode: value.trim() });
    setBusy(false);
    if ('error' in res) {
      setMessage({ ok: false, text: res.error });
      return;
    }
    setSaved(value.trim());
    setMessage({ ok: true, text: t('codeSaved') });
    router.refresh();
  };

  const unchanged = value.trim() === saved;

  return (
    <form onSubmit={save} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <label htmlFor="payroll-code" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{t('codeLabel')}</label>
      <input
        id="payroll-code"
        type="text"
        value={value}
        maxLength={20}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        style={{
          width: 150, padding: '7px 10px', borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-2)', border: '1.5px solid var(--border)',
          color: 'var(--text)', fontSize: 13.5, fontFamily: 'var(--font-mono, var(--font))',
        }}
      />
      <button
        type="submit"
        disabled={busy || unchanged}
        className="btn-ghost"
        style={{
          minHeight: 36, padding: '0 14px', borderRadius: 'var(--radius)',
          background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)',
          fontSize: 13, fontWeight: 600, cursor: busy || unchanged ? 'default' : 'pointer',
          opacity: busy || unchanged ? 0.55 : 1,
        }}
      >
        {t('codeSave')}
      </button>
      {message && (
        <span style={{ fontSize: 12.5, color: message.ok ? 'var(--success)' : 'var(--error)' }}>{message.text}</span>
      )}
    </form>
  );
}
