'use client';

import { useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { removeUserRole } from '@/actions/admin/users';

export function RemoveRoleButton({ roleRowId, label }: { roleRowId: string; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          const r = await removeUserRole(roleRowId);
          if (r.ok) router.refresh();
        });
      }}
      style={{
        fontSize: 11,
        padding: '3px 8px',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--surface-2)',
        color: 'var(--error)',
        cursor: 'pointer',
      }}
    >
      {pending ? '…' : label}
    </button>
  );
}
