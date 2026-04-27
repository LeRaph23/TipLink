'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { updateGroupPlatformFee } from '@/actions/group';

interface Props {
  groupId: string;
  currentBps: number;
}

export function GroupFeeForm({ groupId, currentBps }: Props) {
  const t = useTranslations('dashboard.admin.groups');
  const [bps, setBps] = useState(currentBps);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    setErrorMsg('');
    const result = await updateGroupPlatformFee(groupId, bps);
    if ('error' in result) {
      setStatus('error');
      setErrorMsg(result.error);
    } else {
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5 }}>
          {t('feeBps')}
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="number"
            min={0}
            max={1500}
            step={1}
            value={bps}
            onChange={e => setBps(Math.max(0, Math.min(1500, parseInt(e.target.value, 10) || 0)))}
            style={{
              width: 100, padding: '8px 10px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text)', fontSize: 14, fontWeight: 600,
              fontFamily: 'var(--font)', textAlign: 'right', outline: 'none',
            }}
          />
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.04em' }}>
            {(bps / 100).toFixed(2)}%
          </span>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5 }}>
          {t('feeBps')} · 100 bps = 1% · range 0–1500
        </p>
      </div>

      {status === 'error' && (
        <p style={{ fontSize: 12.5, color: 'var(--error)', margin: 0 }}>{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === 'saving'}
        style={{
          padding: '9px 20px', borderRadius: 8, border: 'none',
          background: status === 'saved' ? 'var(--success)' : 'var(--accent)',
          color: '#fff', fontSize: 13, fontWeight: 600,
          cursor: status === 'saving' ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font)', opacity: status === 'saving' ? 0.7 : 1,
          transition: 'background 200ms', alignSelf: 'flex-start',
        }}
      >
        {status === 'saving' ? t('feeSaving') : status === 'saved' ? t('feeSaved') : t('feeSave')}
      </button>
    </form>
  );
}
