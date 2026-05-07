'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteEstablishment, updateEstablishment } from '@/actions/admin/establishments';

const ghostBtn: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 6, background: 'transparent',
  border: '1px solid var(--border)', color: 'var(--text-2)',
  fontSize: 11.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)',
};
const dangerBtn: React.CSSProperties = {
  ...ghostBtn, border: '1px solid var(--error, #ef4444)', color: 'var(--error, #ef4444)',
};
const input: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, background: 'var(--surface-2)',
  border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font)',
  width: '100%',
};
const primaryBtn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 6, background: 'var(--accent)',
  border: 'none', color: '#fff', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--font)',
};

type BusinessType = 'restaurant' | 'beauty';

type Props = {
  id: string;
  name: string;
  address: string | null;
  businessType: string | null;
};

export function EstablishmentActions({ id, name, address, businessType }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name,
    address: address ?? '',
    businessType: (businessType === 'restaurant' || businessType === 'beauty' ? businessType : 'restaurant') as BusinessType,
  });
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm(`Supprimer "${name}" ? Cette action est irréversible.`)) return;
    startTransition(async () => {
      const res = await deleteEstablishment(id);
      if (!res.ok) setError(res.error);
      else router.refresh();
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

  if (editing) {
    return (
      <td colSpan={5} style={{ padding: '12px 16px', background: 'var(--surface-2)' }}>
        {error && <div style={{ fontSize: 11, color: 'var(--error, #ef4444)', marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
          <label>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Nom</div>
            <input style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Adresse</div>
            <input style={input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </label>
          <label>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Type</div>
            <select style={input} value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value as BusinessType })}>
              <option value="restaurant">Restaurant</option>
              <option value="beauty">Beauté</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={primaryBtn} disabled={pending} onClick={handleSave}>Sauvegarder</button>
          <button style={ghostBtn} disabled={pending} onClick={() => { setEditing(false); setError(null); }}>Annuler</button>
        </div>
      </td>
    );
  }

  return (
    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
      {error && <span style={{ fontSize: 11, color: 'var(--error, #ef4444)', marginRight: 8 }}>{error}</span>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button style={ghostBtn} disabled={pending} onClick={() => setEditing(true)}>Modifier</button>
        <button style={dangerBtn} disabled={pending} onClick={handleDelete}>Supprimer</button>
      </div>
    </td>
  );
}
