'use client';

import { useState, useTransition } from 'react';
import {
  createAmbassador,
  toggleAmbassador,
  deleteAmbassador,
  regenerateAmbassadorSetupToken,
  setAmbassadorPayoutsFrozen,
} from '@/actions/admin/ambassadors';

interface Ambassador {
  id: string;
  name: string;
  is_active: boolean;
  payouts_frozen: boolean;
  created_at: string;
  promoCodeId: string;
  promoCode: string;
  percentageOff: number;
  salesCount: number;
  totalCommission: number;
}

interface AvailablePromoCode {
  id: string;
  code: string;
  percentage_off: number;
}

function fmtEuros(cents: number) {
  return `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
}

export function AmbassadeursManager({
  ambassadors: initialAmbassadors,
  availablePromoCodes,
}: {
  ambassadors: Ambassador[];
  availablePromoCodes: AvailablePromoCode[];
}) {
  const [ambassadors, setAmbassadors] = useState(initialAmbassadors);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdSetupUrl, setCreatedSetupUrl] = useState<{ name: string; url: string; expiresAt: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Create form
  const [name, setName] = useState('');
  const [promoCodeId, setPromoCodeId] = useState('');

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<Ambassador | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Regenerate setup token modal
  const [regenResult, setRegenResult] = useState<{ name: string; url: string; expiresAt: string } | null>(null);

  const handleCreate = () => {
    setFormError(null);
    setCreatedSetupUrl(null);

    if (!name.trim()) { setFormError('Nom requis.'); return; }
    if (!promoCodeId) { setFormError('Sélectionne un code promo.'); return; }

    const ambName = name.trim();
    startTransition(async () => {
      const result = await createAmbassador({ name: ambName, promoCodeId });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      const promoCode = availablePromoCodes.find(p => p.id === promoCodeId);
      setAmbassadors(prev => [{
        id: result.id,
        name: ambName,
        is_active: true,
        payouts_frozen: false,
        created_at: new Date().toISOString(),
        promoCodeId,
        promoCode: promoCode?.code ?? '',
        percentageOff: promoCode?.percentage_off ?? 0,
        salesCount: 0,
        totalCommission: 0,
      }, ...prev]);
      setCreatedSetupUrl({ name: ambName, url: result.setupUrl, expiresAt: result.expiresAt });
      setName(''); setPromoCodeId('');
      setShowForm(false);
    });
  };

  const handleToggle = (id: string, currentActive: boolean) => {
    startTransition(async () => {
      const result = await toggleAmbassador(id, !currentActive);
      if (!result.ok) return;
      setAmbassadors(prev =>
        prev.map(a => a.id === id ? { ...a, is_active: !currentActive } : a)
      );
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    const targetId = deleteTarget.id;
    startTransition(async () => {
      const result = await deleteAmbassador(targetId);
      if (!result.ok) { setDeleteError(result.error); return; }
      setAmbassadors(prev => prev.filter(a => a.id !== targetId));
      setDeleteTarget(null);
    });
  };

  const handleToggleFreeze = (id: string, currentFrozen: boolean) => {
    startTransition(async () => {
      const result = await setAmbassadorPayoutsFrozen(id, !currentFrozen);
      if (!result.ok) { alert(result.error); return; }
      setAmbassadors(prev =>
        prev.map(a => a.id === id ? { ...a, payouts_frozen: !currentFrozen } : a)
      );
    });
  };

  const handleRegenerateToken = (id: string, ambName: string) => {
    startTransition(async () => {
      const result = await regenerateAmbassadorSetupToken(id);
      if (!result.ok) { alert(result.error); return; }
      setRegenResult({ name: ambName, url: result.setupUrl, expiresAt: result.expiresAt });
    });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };
  const btnPrimary: React.CSSProperties = {
    padding: '9px 20px', borderRadius: 8, border: 'none',
    background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  };
  const btnSecondary: React.CSSProperties = {
    padding: '7px 14px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--text-3)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
  };
  const btnDanger: React.CSSProperties = {
    ...btnSecondary,
    color: 'var(--error, #ef4444)',
    borderColor: 'var(--error, #ef4444)',
  };

  return (
    <div>
      {createdSetupUrl && (
        <SetupUrlBanner data={createdSetupUrl} onDismiss={() => setCreatedSetupUrl(null)} />
      )}

      <div style={{ marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button style={btnPrimary} onClick={() => { setShowForm(v => !v); setFormError(null); }}>
          {showForm ? 'Annuler' : '+ Nouvel ambassadeur'}
        </button>
      </div>

      {showForm && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)', padding: '20px', marginBottom: 24,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: 'var(--text)' }}>
            Créer un ambassadeur
          </h3>
          <div className="dash-modal-grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Nom complet</label>
              <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Kevin Martin" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Code promo lié</label>
              <select
                style={inputStyle}
                value={promoCodeId}
                onChange={e => setPromoCodeId(e.target.value)}
              >
                <option value="">Sélectionner…</option>
                {availablePromoCodes.map(p => (
                  <option key={p.id} value={p.id}>{p.code} (-{p.percentage_off}%)</option>
                ))}
              </select>
              {availablePromoCodes.length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>
                  Tous les codes promo actifs sont déjà liés. Créez d&apos;abord un nouveau code promo.
                </p>
              )}
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 4px' }}>
              Commissions : <strong>25 € / vente Solo</strong> · <strong>35 € / vente Duo</strong>
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 4px' }}>
              Bonus hebdo : 5 ventes +15€ · 8 ventes +30€ · 10 ventes +50€ (non cumulatifs)
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
              <strong>Le PIN sera défini par l&apos;ambassadeur</strong> via le lien d&apos;activation généré à la création.
            </p>
          </div>
          {formError && (
            <div style={{ marginTop: 12, color: 'var(--error)', fontSize: 13, padding: '8px 12px', background: 'var(--error-bg)', borderRadius: 6 }}>
              {formError}
            </div>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button style={btnPrimary} onClick={handleCreate} disabled={isPending}>
              {isPending ? 'Création…' : 'Créer l\'ambassadeur'}
            </button>
            <button style={btnSecondary} onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {ambassadors.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Aucun ambassadeur. Créez-en un ci-dessus.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Nom', 'Code promo', 'Ventes', 'Commissions', 'Dashboard', 'Statut', 'Actions'].map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                    color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em',
                    borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ambassadors.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)', opacity: a.is_active ? 1 : 0.5 }}>
                  <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text)' }}>{a.name}</td>
                  <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--accent)', fontSize: 12 }}>
                    {a.promoCode} {a.percentageOff > 0 && <span style={{ color: 'var(--text-3)', fontFamily: 'inherit' }}>(-{a.percentageOff}%)</span>}
                  </td>
                  <td style={{ padding: '11px 14px', fontWeight: 700 }}>{a.salesCount}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--success)', fontWeight: 600 }}>{fmtEuros(a.totalCommission)}</td>
                  <td style={{ padding: '11px 14px' }}>
                    {a.promoCode && (
                      <a
                        href={`/api/admin/ambassador-session/${a.promoCode.toLowerCase()}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }}
                      >
                        Voir →
                      </a>
                    )}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                        background: a.is_active ? 'var(--success-bg)' : 'var(--neutral-bg)',
                        color: a.is_active ? 'var(--success)' : 'var(--neutral)',
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                        {a.is_active ? 'Actif' : 'Inactif'}
                      </span>
                      {a.payouts_frozen && (
                        <span
                          title="Les virements de cet ambassadeur sont gelés."
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                            background: 'var(--warning-bg)', color: 'var(--warning)',
                          }}
                        >
                          ❄ Gelé
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        style={btnSecondary}
                        onClick={() => handleToggle(a.id, a.is_active)}
                        disabled={isPending}
                      >
                        {a.is_active ? 'Désactiver' : 'Activer'}
                      </button>
                      <button
                        style={btnSecondary}
                        onClick={() => handleToggleFreeze(a.id, a.payouts_frozen)}
                        disabled={isPending}
                        title={a.payouts_frozen
                          ? 'Réautorise les virements de cet ambassadeur'
                          : 'Bloque les virements sans désactiver le compte'}
                      >
                        {a.payouts_frozen ? '☀ Dégeler' : '❄ Geler'}
                      </button>
                      <button
                        style={btnSecondary}
                        onClick={() => handleRegenerateToken(a.id, a.name)}
                        disabled={isPending}
                        title="Génère un nouveau lien d'activation et réinitialise le PIN (l'ambassadeur définira lui-même son nouveau PIN)"
                      >
                        🔗 Lien
                      </button>
                      <button
                        style={btnDanger}
                        onClick={() => { setDeleteTarget(a); setDeleteError(null); }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {regenResult && (
        <SetupUrlModal data={regenResult} onClose={() => setRegenResult(null)} />
      )}

      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: 24, width: 380,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px', color: 'var(--error, #ef4444)' }}>
              Supprimer définitivement
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.5 }}>
              Supprimer <strong>{deleteTarget.name}</strong> (code <code>{deleteTarget.promoCode}</code>) ?
              Cette action est <strong>irréversible</strong> et efface aussi ses payouts, parrainages, contrats et logs email.
              {deleteTarget.salesCount > 0 && (
                <span style={{ color: 'var(--warning)', display: 'block', marginTop: 8 }}>
                  ⚠️ Cet ambassadeur a {deleteTarget.salesCount} vente(s). La suppression sera refusée — désactive-le plutôt.
                </span>
              )}
            </p>
            {deleteError && (
              <div style={{ marginTop: 8, color: 'var(--error)', fontSize: 12 }}>{deleteError}</div>
            )}
            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <button style={{ ...btnPrimary, background: 'var(--error, #ef4444)' }} onClick={handleDelete} disabled={isPending}>
                {isPending ? '…' : 'Supprimer définitivement'}
              </button>
              <button style={btnSecondary} onClick={() => setDeleteTarget(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SetupUrlBanner({ data, onDismiss }: { data: { name: string; url: string; expiresAt: string }; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(data.url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };
  return (
    <div style={{
      background: 'var(--success-bg)', border: '1px solid var(--success)',
      borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)', marginBottom: 4 }}>
            ✓ {data.name} créé. Envoie-lui ce lien d&apos;activation :
          </div>
          <code style={{ display: 'block', fontSize: 11, color: 'var(--text-2)', wordBreak: 'break-all', background: 'var(--surface-2)', padding: '6px 8px', borderRadius: 4, marginTop: 6 }}>
            {data.url}
          </code>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
            Le lien expire le {new Date(data.expiresAt).toLocaleString('fr-FR')}.
            L&apos;ambassadeur définira lui-même son PIN à la première connexion.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={copy} style={{ padding: '6px 12px', fontSize: 12, border: '1px solid var(--success)', borderRadius: 6, background: 'transparent', color: 'var(--success)', cursor: 'pointer', fontWeight: 600 }}>
            {copied ? '✓ Copié' : 'Copier'}
          </button>
          <button onClick={onDismiss} style={{ padding: '6px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function SetupUrlModal({ data, onClose }: { data: { name: string; url: string; expiresAt: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(data.url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, width: 460 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px', color: 'var(--text)' }}>
          Nouveau lien d&apos;activation pour {data.name}
        </h3>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 12 }}>
          L&apos;ancien lien et le PIN sont invalidés. Envoie ce nouveau lien à l&apos;ambassadeur (expire le {new Date(data.expiresAt).toLocaleString('fr-FR')}) — il définira lui-même son nouveau PIN :
        </p>
        <code style={{ display: 'block', fontSize: 11, color: 'var(--text-2)', wordBreak: 'break-all', background: 'var(--surface-2)', padding: '8px 10px', borderRadius: 6 }}>
          {data.url}
        </code>
        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <button onClick={copy} style={{ padding: '8px 16px', fontSize: 13, border: 'none', borderRadius: 6, background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            {copied ? '✓ Copié' : 'Copier le lien'}
          </button>
          <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
