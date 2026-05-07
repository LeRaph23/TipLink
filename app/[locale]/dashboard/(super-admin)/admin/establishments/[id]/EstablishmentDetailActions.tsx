'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteEstablishment, updateEstablishment } from '@/actions/admin/establishments';

const ghostBtn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 6, background: 'transparent',
  border: '1px solid var(--border)', color: 'var(--text-2)',
  fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)',
};
const dangerBtn: React.CSSProperties = {
  ...ghostBtn, border: '1px solid var(--error, #ef4444)', color: 'var(--error, #ef4444)',
};
const primaryBtn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 6, background: 'var(--accent)',
  border: 'none', color: '#fff', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--font)',
};
const input: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 6, background: 'var(--surface-2)',
  border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)',
  width: '100%',
};
const modal: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20, zIndex: 50,
};
const modalBox: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: 22, width: '100%', maxWidth: 480,
};

type Props = {
  id: string;
  name: string;
  address: string | null;
  businessType: string | null;
};

export function EstablishmentDetailActions({ id, name, address, businessType }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name, address: address ?? '', businessType: businessType ?? '' });
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm(`Supprimer "${name}" ? Cette action est irréversible.`)) return;
    startTransition(async () => {
      const res = await deleteEstablishment(id);
      if (!res.ok) setError(res.error);
      else router.push('/dashboard/admin/establishments');
    });
  }

  function handleSave() {
    startTransition(async () => {
      const res = await updateEstablishment(id, {
        name: form.name,
        address: form.address,
        business_type: form.businessType,
      });
      if (!res.ok) setError(res.error);
      else { setEditing(false); router.refresh(); }
    });
  }

  return (
    <>
      {error && (
        <div style={{ fontSize: 12, color: 'var(--error, #ef4444)', marginTop: 4 }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={ghostBtn} disabled={pending} onClick={() => setEditing(true)}>Modifier</button>
        <button style={dangerBtn} disabled={pending} onClick={handleDelete}>Supprimer</button>
      </div>

      {editing && (
        <div style={modal} onClick={() => setEditing(false)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
              Modifier — {name}
            </h2>
            {error && <div style={{ fontSize: 12, color: 'var(--error, #ef4444)', marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
              <label>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 5 }}>Nom</div>
                <input style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 5 }}>Adresse</div>
                <input style={input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </label>
              <label>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 5 }}>Type</div>
                <select style={input} value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })}>
                  <option value="restaurant">Restaurant</option>
                  <option value="beauty">Beauty</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={ghostBtn} disabled={pending} onClick={() => { setEditing(false); setError(null); }}>Annuler</button>
              <button style={primaryBtn} disabled={pending} onClick={handleSave}>
                {pending ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
