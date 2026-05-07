'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteGroup, updateGroupName } from '@/actions/admin/groups';

const ghostBtn: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 6, background: 'transparent',
  border: '1px solid var(--border)', color: 'var(--text-2)',
  fontSize: 11.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)',
};
const dangerBtn: React.CSSProperties = {
  ...ghostBtn, border: '1px solid var(--error, #ef4444)', color: 'var(--error, #ef4444)',
};
const input: React.CSSProperties = {
  flex: 1, padding: '7px 10px', borderRadius: 6,
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)',
};
const primaryBtn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 6, background: 'var(--accent)',
  border: 'none', color: '#fff', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--font)',
};

export function GroupActions({ groupId, groupName }: { groupId: string; groupName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(groupName);
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm(`Supprimer le groupe "${groupName}" ? Cette action est irréversible.`)) return;
    startTransition(async () => {
      const res = await deleteGroup(groupId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function handleRename() {
    startTransition(async () => {
      const res = await updateGroupName(groupId, name);
      if (!res.ok) setError(res.error);
      else { setEditing(false); router.refresh(); }
    });
  }

  return (
    <div style={{ marginTop: 10 }}>
      {error && <div style={{ fontSize: 11, color: 'var(--error, #ef4444)', marginBottom: 6 }}>{error}</div>}
      {editing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            style={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
          />
          <button style={primaryBtn} disabled={pending} onClick={handleRename}>OK</button>
          <button style={ghostBtn} disabled={pending} onClick={() => setEditing(false)}>✕</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={ghostBtn} disabled={pending} onClick={() => setEditing(true)}>Renommer</button>
          <button style={dangerBtn} disabled={pending} onClick={handleDelete}>Supprimer</button>
        </div>
      )}
    </div>
  );
}
