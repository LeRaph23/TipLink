'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { updateGroupFeeBps } from '@/actions/admin/groups';

type Props = {
  groupId: string;
  initialBps: number;
};

export function GroupFeeEditor({ groupId, initialBps }: Props) {
  const t = useTranslations('dashboard.admin.groups');
  const [bps, setBps] = useState(initialBps);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const pct = (bps / 100).toFixed(2);
  const unchanged = bps === initialBps;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Math.round(parseFloat(e.target.value) * 100);
    if (!Number.isNaN(val)) setBps(Math.max(0, Math.min(1500, val)));
  }

  function handleSave() {
    setFeedback(null);
    startTransition(async () => {
      const res = await updateGroupFeeBps(groupId, bps);
      setFeedback(res.ok ? { ok: true, msg: t('feeSaved') } : { ok: false, msg: res.error });
    });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
      <label style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
        {t('feeLabel')}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden', background: 'var(--surface-2)' }}>
        <input
          type="number"
          min={0}
          max={15}
          step={0.01}
          value={pct}
          onChange={handleChange}
          style={{
            width: 60, padding: '4px 8px', fontSize: 13, fontWeight: 600,
            background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--text)', textAlign: 'right',
          }}
        />
        <span style={{ padding: '4px 8px 4px 2px', fontSize: 13, color: 'var(--text-3)' }}>%</span>
      </div>
      <button
        onClick={handleSave}
        disabled={unchanged || isPending}
        style={{
          padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
          cursor: unchanged || isPending ? 'not-allowed' : 'pointer',
          background: unchanged || isPending ? 'var(--surface-2)' : 'var(--accent)',
          color: unchanged || isPending ? 'var(--text-3)' : '#fff',
          border: 'none', transition: 'all 140ms',
        }}
      >
        {isPending ? t('feeSaving') : t('feeSave')}
      </button>
      {feedback && (
        <span style={{ fontSize: 11.5, color: feedback.ok ? 'var(--success)' : 'var(--danger)', whiteSpace: 'nowrap' }}>
          {feedback.msg}
        </span>
      )}
    </div>
  );
}
