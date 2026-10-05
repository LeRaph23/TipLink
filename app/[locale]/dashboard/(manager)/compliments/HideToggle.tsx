'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { setComplimentHidden } from '@/actions/compliments';

export function HideToggle({ id, hidden }: { id: string; hidden: boolean }) {
  const t = useTranslations('dashboard.compliments');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-ghost"
      disabled={pending}
      onClick={() => start(async () => {
        await setComplimentHidden(id, !hidden);
        router.refresh();
      })}
      style={{
        padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)',
        background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: 12, fontWeight: 500,
        cursor: pending ? 'default' : 'pointer', fontFamily: 'var(--font)', opacity: pending ? 0.6 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {hidden ? t('unhide') : t('hide')}
    </button>
  );
}
