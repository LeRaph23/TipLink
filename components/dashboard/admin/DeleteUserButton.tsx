'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAuthUser } from '@/actions/admin/users';

export function DeleteUserButton({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Supprimer le compte de ${email} ? Toutes ses données d'authentification seront effacées.`)) return;
    startTransition(async () => {
      const res = await deleteAuthUser(userId);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <button
      disabled={pending}
      onClick={handleClick}
      style={{
        padding: '4px 10px', borderRadius: 6, background: 'transparent',
        border: '1px solid var(--error, #ef4444)', color: 'var(--error, #ef4444)',
        fontSize: 11.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)',
        marginLeft: 6,
      }}
    >
      {pending ? '…' : 'Supprimer'}
    </button>
  );
}
