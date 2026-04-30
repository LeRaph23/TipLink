'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { addUserRole } from '@/actions/admin/users';

type Opt = { id: string; name: string };

export function UserRoleAddForm({
  users,
  groups,
  establishments,
  labels,
}: {
  users: { id: string; email: string }[];
  groups: Opt[];
  establishments: Opt[];
  labels: {
    user: string;
    role: string;
    group: string;
    establishment: string;
    submit: string;
    super: string;
    groupAdmin: string;
    staffScoped: string;
  };
}) {
  const [kind, setKind] = useState<'super' | 'group_admin' | 'scoped'>('super');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const fd = new FormData(e.currentTarget);
      if (kind === 'super') {
        fd.set('role', 'super_admin');
        fd.delete('group_id');
        fd.delete('establishment_id');
      } else if (kind === 'group_admin') {
        fd.set('role', 'group_admin');
        fd.delete('establishment_id');
      } else {
        const r = String(fd.get('scoped_role') ?? 'manager');
        fd.set('role', r);
        fd.delete('scoped_role');
        fd.delete('group_id');
      }
      const res = await addUserRole(fd);
      if (!res.ok) setMsg(res.error);
      else {
        setMsg('OK');
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10, maxWidth: 480 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['super', 'group_admin', 'scoped'] as const).map((k) => (
          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="radio" name="_kind" checked={kind === k} onChange={() => setKind(k)} />
            {k === 'super' ? labels.super : k === 'group_admin' ? labels.groupAdmin : labels.staffScoped}
          </label>
        ))}
      </div>
      <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
        {labels.user}
        <select name="user_id" required style={sel}>
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.email}</option>
          ))}
        </select>
      </label>
      {kind === 'group_admin' && (
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
          {labels.group}
          <select name="group_id" required style={sel}>
            <option value="">—</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>
      )}
      {kind === 'scoped' && (
        <>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
            {labels.role}
            <select name="scoped_role" style={sel}>
              <option value="manager">manager</option>
              <option value="staff">staff</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
            {labels.establishment}
            <select name="establishment_id" required style={sel}>
              <option value="">—</option>
              {establishments.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
        </>
      )}
      <button type="submit" disabled={pending} style={btn}>
        {pending ? '…' : labels.submit}
      </button>
      {msg && msg !== 'OK' && (
        <div style={{ fontSize: 12, color: 'var(--error)' }}>{msg}</div>
      )}
      {msg === 'OK' && (
        <div style={{ fontSize: 12, color: 'var(--success)' }}>OK</div>
      )}
    </form>
  );
}

const sel: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 13,
};

const btn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--accent)',
  color: 'var(--accent-contrast, #fff)',
  border: 'none',
  fontWeight: 600,
  cursor: 'pointer',
};
