'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createPromoCode,
  togglePromoCode,
  updatePromoCode,
  deletePromoCode,
} from '@/actions/admin/promo-codes';

type PromoCode = {
  id: string;
  code: string;
  percentage_off: number;
  max_redemptions: number | null;
  times_redeemed: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

const input: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)', boxSizing: 'border-box',
};
const primaryBtn: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 'var(--radius-sm)',
  background: 'var(--accent)', border: '1px solid var(--accent)',
  color: 'var(--accent-contrast, #fff)', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--font)',
};
const secondaryBtn: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text-2)', fontSize: 11.5, fontWeight: 500,
  cursor: 'pointer', fontFamily: 'var(--font)',
};
const dangerBtn: React.CSSProperties = {
  ...secondaryBtn,
  border: '1px solid var(--error)',
  color: 'var(--error)',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

type FormValues = { code: string; percentage: number; maxRedeem: string; expiresAt: string };
const emptyForm: FormValues = { code: '', percentage: 10, maxRedeem: '', expiresAt: '' };

function fromPromo(p: PromoCode): FormValues {
  return {
    code: p.code,
    percentage: p.percentage_off,
    maxRedeem: p.max_redemptions ? String(p.max_redemptions) : '',
    expiresAt: p.expires_at ? p.expires_at.slice(0, 10) : '',
  };
}

function PromoForm({
  mode,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit';
  initial: FormValues;
  pending: boolean;
  onSubmit: (v: FormValues) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<FormValues>(initial);

  const update = (patch: Partial<FormValues>) => setV((prev) => ({ ...prev, ...patch }));

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: 20, marginBottom: 20,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>
        {mode === 'create' ? 'Nouveau code promo' : `Modifier "${initial.code}"`}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>Code (ex: SUMMER20)</div>
          <input
            type="text" style={input} value={v.code}
            onChange={e => update({ code: e.target.value.toUpperCase() })}
            placeholder="SUMMER20" maxLength={20}
          />
        </label>
        <label>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>Réduction (%)</div>
          <input
            type="number" style={input} value={v.percentage} min={1} max={100}
            onChange={e => update({ percentage: Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
          />
          {mode === 'edit' && v.percentage !== initial.percentage && (
            <div style={{ fontSize: 10.5, color: 'var(--warning)', marginTop: 4 }}>
              Changer le % recrée le coupon Stripe.
            </div>
          )}
        </label>
        <label>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>Utilisations max (optionnel)</div>
          <input
            type="number" style={input} value={v.maxRedeem} min={1}
            onChange={e => update({ maxRedeem: e.target.value })}
            placeholder="Illimité"
          />
        </label>
        <label>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>Expiration (optionnel)</div>
          <input type="date" style={input} value={v.expiresAt} onChange={e => update({ expiresAt: e.target.value })} />
        </label>
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button
          style={primaryBtn}
          disabled={pending || !v.code.trim() || v.percentage < 1}
          onClick={() => onSubmit(v)}
        >
          {pending
            ? mode === 'create' ? 'Création…' : 'Enregistrement…'
            : mode === 'create'
              ? `Créer "${v.code.toUpperCase() || '…'}" — ${v.percentage}% de remise`
              : 'Enregistrer les modifications'}
        </button>
        <button style={secondaryBtn} disabled={pending} onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}

export function PromoCodesManager({ initialCodes }: { initialCodes: PromoCode[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formMode, setFormMode] = useState<'none' | 'create' | 'edit'>('none');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function openCreate() {
    setEditingId(null);
    setError(null);
    setFormMode('create');
  }

  function openEdit(p: PromoCode) {
    setEditingId(p.id);
    setError(null);
    setFormMode('edit');
  }

  function closeForm() {
    setFormMode('none');
    setEditingId(null);
    setError(null);
  }

  const handleCreate = (v: FormValues) => {
    setError(null);
    startTransition(async () => {
      const res = await createPromoCode({
        code: v.code.trim().toUpperCase(),
        percentageOff: v.percentage,
        maxRedemptions: v.maxRedeem ? parseInt(v.maxRedeem, 10) : null,
        expiresAt: v.expiresAt || null,
      });
      if (!res.ok) {
        setError(res.error);
      } else {
        notify(`Code ${v.code.toUpperCase()} créé !`);
        closeForm();
        router.refresh();
      }
    });
  };

  const handleUpdate = (v: FormValues) => {
    if (!editingId) return;
    setError(null);
    startTransition(async () => {
      const res = await updatePromoCode(editingId, {
        code: v.code.trim().toUpperCase(),
        percentageOff: v.percentage,
        maxRedemptions: v.maxRedeem ? parseInt(v.maxRedeem, 10) : null,
        expiresAt: v.expiresAt || null,
      });
      if (!res.ok) {
        setError(res.error);
      } else {
        notify('Code promo mis à jour.');
        closeForm();
        router.refresh();
      }
    });
  };

  const handleToggle = (id: string, currentActive: boolean) => {
    startTransition(async () => {
      const res = await togglePromoCode(id, !currentActive);
      if (!res.ok) setError(res.error);
      else { notify(currentActive ? 'Code désactivé.' : 'Code activé.'); router.refresh(); }
    });
  };

  const handleDelete = (id: string) => {
    setError(null);
    startTransition(async () => {
      const res = await deletePromoCode(id);
      if (!res.ok) {
        setError(res.error);
      } else {
        setConfirmDeleteId(null);
        notify('Code promo supprimé.');
        router.refresh();
      }
    });
  };

  const editingPromo = editingId ? initialCodes.find((p) => p.id === editingId) ?? null : null;

  return (
    <div>
      {toast && (
        <div style={{ padding: 10, marginBottom: 14, borderRadius: 'var(--radius-sm)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: 12 }}>
          {toast}
        </div>
      )}
      {error && (
        <div style={{ padding: 10, marginBottom: 14, borderRadius: 'var(--radius-sm)', background: 'var(--error-bg)', color: 'var(--error)', fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={primaryBtn} onClick={formMode === 'create' ? closeForm : openCreate}>
          {formMode === 'create' ? 'Annuler' : '+ Créer un code promo'}
        </button>
      </div>

      {formMode === 'create' && (
        <PromoForm
          mode="create"
          initial={emptyForm}
          pending={pending}
          onSubmit={handleCreate}
          onCancel={closeForm}
        />
      )}

      {formMode === 'edit' && editingPromo && (
        <PromoForm
          mode="edit"
          initial={fromPromo(editingPromo)}
          pending={pending}
          onSubmit={handleUpdate}
          onCancel={closeForm}
        />
      )}

      {initialCodes.length === 0 ? (
        <div style={{
          padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13,
          background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)',
        }}>
          Aucun code promo créé. Cliquez sur « Créer un code promo » pour commencer.
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Code', 'Remise', 'Utilisations', 'Max', 'Expiration', 'Créé le', 'Statut', 'Actions'].map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initialCodes.map((p) => {
                const expired = isExpired(p.expires_at);
                const exhausted = p.max_redemptions !== null && p.times_redeemed >= p.max_redemptions;
                const isEditingThis = formMode === 'edit' && editingId === p.id;
                const isConfirmingDelete = confirmDeleteId === p.id;

                return (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: isEditingThis ? 'var(--accent-muted)' : undefined,
                    }}
                  >
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--text)' }}>
                      {p.code}
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--success)', fontWeight: 600 }}>
                      -{p.percentage_off}%
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                      {p.times_redeemed}
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-3)' }}>
                      {p.max_redemptions ?? '∞'}
                    </td>
                    <td style={{ padding: '11px 14px', color: expired ? 'var(--error)' : 'var(--text-3)' }}>
                      {p.expires_at ? formatDate(p.expires_at) : '—'}
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-3)', fontSize: 12 }}>
                      {formatDate(p.created_at)}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {expired || exhausted ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 100, background: 'var(--error-bg)', color: 'var(--error)' }}>
                          {expired ? 'Expiré' : 'Épuisé'}
                        </span>
                      ) : p.is_active ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 100, background: 'var(--success-bg)', color: 'var(--success)' }}>
                          Actif
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 100, background: 'var(--neutral-bg)', color: 'var(--neutral)' }}>
                          Désactivé
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {isConfirmingDelete ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11.5, color: 'var(--error)', fontWeight: 500 }}>Confirmer ?</span>
                          <button
                            style={{ ...dangerBtn, fontSize: 11, padding: '4px 9px' }}
                            disabled={pending}
                            onClick={() => handleDelete(p.id)}
                          >
                            {pending ? '…' : 'Oui, supprimer'}
                          </button>
                          <button
                            style={{ ...secondaryBtn, fontSize: 11, padding: '4px 9px' }}
                            disabled={pending}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Non
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 5 }}>
                          {!expired && !exhausted && (
                            <button
                              style={{
                                ...secondaryBtn,
                                color: p.is_active ? 'var(--error)' : 'var(--success)',
                                borderColor: p.is_active ? 'var(--error)' : 'var(--success)',
                              }}
                              disabled={pending}
                              onClick={() => handleToggle(p.id, p.is_active)}
                            >
                              {p.is_active ? 'Désactiver' : 'Activer'}
                            </button>
                          )}
                          <button
                            style={{
                              ...secondaryBtn,
                              background: isEditingThis ? 'var(--accent-muted)' : undefined,
                              borderColor: isEditingThis ? 'var(--accent)' : undefined,
                              color: isEditingThis ? 'var(--accent)' : undefined,
                            }}
                            disabled={pending}
                            onClick={() => isEditingThis ? closeForm() : openEdit(p)}
                          >
                            {isEditingThis ? 'Annuler' : 'Modifier'}
                          </button>
                          <button
                            style={dangerBtn}
                            disabled={pending}
                            onClick={() => { setConfirmDeleteId(p.id); setFormMode('none'); }}
                          >
                            Supprimer
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
