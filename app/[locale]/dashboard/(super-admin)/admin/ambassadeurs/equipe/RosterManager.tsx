'use client';

import { useMemo, useState, useTransition } from 'react';
import { Link } from '@/i18n/navigation';
import {
  createAmbassador,
  toggleAmbassador,
  deleteAmbassador,
  regenerateAmbassadorSetupToken,
  setAmbassadorPayoutsFrozen,
  setAmbassadorReferrer,
} from '@/actions/admin/ambassadors';

export interface RosterAmbassador {
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
  weekCount: number;
  weeklyTier: { label: string; emoji: string } | null;
  referrerAmbassadorId: string | null;
}

interface AvailablePromoCode {
  id: string;
  code: string;
  percentage_off: number;
}

interface ReferrerOption {
  id: string;
  name: string;
}

type StatusFilter = 'all' | 'active' | 'inactive';
type SortKey = 'recent' | 'name' | 'sales' | 'commission';

function fmtEuros(cents: number) {
  return `${Math.round(cents / 100).toLocaleString('fr-FR')} €`;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const btnPrimary: React.CSSProperties = {
  padding: '9px 20px', borderRadius: 8, border: 'none',
  background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-3)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
};
const btnDanger: React.CSSProperties = {
  ...btnSecondary, color: 'var(--error, #ef4444)', borderColor: 'var(--error, #ef4444)',
};
const toolbarControl: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', fontSize: 13, outline: 'none',
};

export function RosterManager({
  ambassadors: initialAmbassadors,
  availablePromoCodes,
  referrerOptions,
}: {
  ambassadors: RosterAmbassador[];
  availablePromoCodes: AvailablePromoCode[];
  referrerOptions: ReferrerOption[];
}) {
  const [ambassadors, setAmbassadors] = useState(initialAmbassadors);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdSetupUrl, setCreatedSetupUrl] = useState<{ name: string; url: string; expiresAt: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState('');
  const [promoCodeId, setPromoCodeId] = useState('');
  const [referrerAmbassadorId, setReferrerAmbassadorId] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<RosterAmbassador | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [regenResult, setRegenResult] = useState<{ name: string; url: string; expiresAt: string } | null>(null);
  const [referrerError, setReferrerError] = useState<string | null>(null);

  // Filtering / sorting
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('recent');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = ambassadors.filter((a) => {
      if (statusFilter === 'active' && !a.is_active) return false;
      if (statusFilter === 'inactive' && a.is_active) return false;
      if (q && !a.name.toLowerCase().includes(q) && !a.promoCode.toLowerCase().includes(q)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name': return a.name.localeCompare(b.name);
        case 'sales': return b.salesCount - a.salesCount;
        case 'commission': return b.totalCommission - a.totalCommission;
        default: return +new Date(b.created_at) - +new Date(a.created_at);
      }
    });
    return list;
  }, [ambassadors, query, statusFilter, sortKey]);

  const handleCreate = () => {
    setFormError(null);
    setCreatedSetupUrl(null);
    if (!name.trim()) { setFormError('Nom requis.'); return; }
    if (!promoCodeId) { setFormError('Sélectionnez un code promo.'); return; }

    const ambName = name.trim();
    const refId = referrerAmbassadorId || null;
    startTransition(async () => {
      const result = await createAmbassador({ name: ambName, promoCodeId, referrerAmbassadorId: refId });
      if (!result.ok) { setFormError(result.error); return; }
      const promoCode = availablePromoCodes.find((p) => p.id === promoCodeId);
      setAmbassadors((prev) => [{
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
        weekCount: 0,
        weeklyTier: null,
        referrerAmbassadorId: refId,
      }, ...prev]);
      setCreatedSetupUrl({ name: ambName, url: result.setupUrl, expiresAt: result.expiresAt });
      setName(''); setPromoCodeId(''); setReferrerAmbassadorId('');
      setShowForm(false);
    });
  };

  const handleToggle = (id: string, currentActive: boolean) => {
    startTransition(async () => {
      const result = await toggleAmbassador(id, !currentActive);
      if (!result.ok) return;
      setAmbassadors((prev) => prev.map((a) => (a.id === id ? { ...a, is_active: !currentActive } : a)));
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    const targetId = deleteTarget.id;
    startTransition(async () => {
      const result = await deleteAmbassador(targetId);
      if (!result.ok) { setDeleteError(result.error); return; }
      setAmbassadors((prev) => prev.filter((a) => a.id !== targetId));
      setDeleteTarget(null);
    });
  };

  const handleSetReferrer = (id: string, newReferrerId: string) => {
    const prevValue = ambassadors.find((a) => a.id === id)?.referrerAmbassadorId ?? null;
    const next = newReferrerId || null;
    setReferrerError(null);
    setAmbassadors((prev) => prev.map((a) => (a.id === id ? { ...a, referrerAmbassadorId: next } : a)));
    startTransition(async () => {
      const result = await setAmbassadorReferrer(id, next);
      if (!result.ok) {
        setReferrerError(result.error);
        setAmbassadors((prev) => prev.map((a) => (a.id === id ? { ...a, referrerAmbassadorId: prevValue } : a)));
      }
    });
  };

  const handleToggleFreeze = (id: string, currentFrozen: boolean) => {
    startTransition(async () => {
      const result = await setAmbassadorPayoutsFrozen(id, !currentFrozen);
      if (!result.ok) { alert(result.error); return; }
      setAmbassadors((prev) => prev.map((a) => (a.id === id ? { ...a, payouts_frozen: !currentFrozen } : a)));
    });
  };

  const handleRegenerateToken = (id: string, ambName: string) => {
    startTransition(async () => {
      const result = await regenerateAmbassadorSetupToken(id);
      if (!result.ok) { alert(result.error); return; }
      setRegenResult({ name: ambName, url: result.setupUrl, expiresAt: result.expiresAt });
    });
  };

  const activeCount = ambassadors.filter((a) => a.is_active).length;

  return (
    <div>
      {createdSetupUrl && <SetupUrlBanner data={createdSetupUrl} onDismiss={() => setCreatedSetupUrl(null)} />}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un nom ou un code promo…"
          style={{ ...toolbarControl, flex: 1, minWidth: 220 }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} style={toolbarControl}>
          <option value="all">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
        </select>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={toolbarControl}>
          <option value="recent">Plus récents</option>
          <option value="name">Nom (A→Z)</option>
          <option value="sales">Ventes ↓</option>
          <option value="commission">Commissions ↓</option>
        </select>
        <button style={btnPrimary} onClick={() => { setShowForm((v) => !v); setFormError(null); }}>
          {showForm ? 'Annuler' : '+ Nouvel ambassadeur'}
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
        {visible.length} affiché{visible.length !== 1 ? 's' : ''} · {activeCount} actif{activeCount !== 1 ? 's' : ''} sur {ambassadors.length}
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
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Kevin Martin" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Code promo lié</label>
              <select style={inputStyle} value={promoCodeId} onChange={(e) => setPromoCodeId(e.target.value)}>
                <option value="">Sélectionner…</option>
                {availablePromoCodes.map((p) => (
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
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
              Parrain (optionnel)
            </label>
            <select style={{ ...inputStyle, maxWidth: 320 }} value={referrerAmbassadorId} onChange={(e) => setReferrerAmbassadorId(e.target.value)}>
              <option value="">Aucun parrain</option>
              {referrerOptions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' }}>
              Si ce candidat a été recruté via un code de parrainage, sélectionnez le parrain :
              il touchera 25 € une fois que ce filleul aura fait 3 ventes (crédit à valider par vous).
            </p>
          </div>
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 4px' }}>
              Commissions : <strong>35 € / vente Solo</strong> · <strong>45 € / vente Duo</strong>
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

      {referrerError && (
        <div style={{ marginBottom: 12, color: 'var(--error)', fontSize: 13, padding: '8px 12px', background: 'var(--error-bg)', borderRadius: 6 }}>
          {referrerError}
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {visible.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            {ambassadors.length === 0 ? 'Aucun ambassadeur. Créez-en un ci-dessus.' : 'Aucun ambassadeur ne correspond à la recherche.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Nom', 'Code promo', 'Parrain', 'Semaine', 'Ventes', 'Commissions', 'Statut', 'Actions'].map((h, i) => (
                    <th key={i} style={{
                      padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                      color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em',
                      borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)', opacity: a.is_active ? 1 : 0.55 }}>
                    <td style={{ padding: '11px 14px', fontWeight: 600 }}>
                      <Link href={`/dashboard/admin/ambassadeurs/${a.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                        {a.name}
                      </Link>
                    </td>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-2)', fontSize: 12 }}>
                      {a.promoCode}{a.percentageOff > 0 && <span style={{ color: 'var(--text-3)' }}> (-{a.percentageOff}%)</span>}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <select
                        value={a.referrerAmbassadorId ?? ''}
                        onChange={(e) => handleSetReferrer(a.id, e.target.value)}
                        disabled={isPending}
                        title="Parrain de cet ambassadeur — il touche 25€ une fois ce filleul à 3 ventes"
                        style={{
                          padding: '5px 8px', borderRadius: 6, fontSize: 12,
                          border: '1px solid var(--border)', background: 'var(--surface)',
                          color: a.referrerAmbassadorId ? 'var(--text)' : 'var(--text-3)',
                          maxWidth: 140, outline: 'none',
                        }}
                      >
                        <option value="">— Aucun —</option>
                        {referrerOptions.filter((r) => r.id !== a.id).map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 700 }}>{a.weekCount}</span>
                      {a.weeklyTier && (
                        <span style={{ marginLeft: 4, fontSize: 12 }} title={`Palier ${a.weeklyTier.label}`}>
                          {a.weeklyTier.emoji}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px', fontWeight: 700 }}>{a.salesCount}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--success)', fontWeight: 600 }}>{fmtEuros(a.totalCommission)}</td>
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
                          <span title="Les virements de cet ambassadeur sont gelés." style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                            background: 'var(--warning-bg)', color: 'var(--warning)',
                          }}>
                            ❄ Gelé
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Link
                          href={`/dashboard/admin/ambassadeurs/${a.id}`}
                          style={{ ...btnSecondary, textDecoration: 'none', color: 'var(--accent)', borderColor: 'var(--accent-border, var(--border))' }}
                        >
                          Fiche
                        </Link>
                        <button style={btnSecondary} onClick={() => handleToggle(a.id, a.is_active)} disabled={isPending}>
                          {a.is_active ? 'Désactiver' : 'Activer'}
                        </button>
                        <button
                          style={btnSecondary}
                          onClick={() => handleToggleFreeze(a.id, a.payouts_frozen)}
                          disabled={isPending}
                          title={a.payouts_frozen ? 'Réautorise les virements' : 'Bloque les virements sans désactiver le compte'}
                        >
                          {a.payouts_frozen ? '☀ Dégeler' : '❄ Geler'}
                        </button>
                        <button
                          style={btnSecondary}
                          onClick={() => handleRegenerateToken(a.id, a.name)}
                          disabled={isPending}
                          title="Génère un nouveau lien d'activation et réinitialise le PIN"
                        >
                          🔗 Lien
                        </button>
                        <button style={btnDanger} onClick={() => { setDeleteTarget(a); setDeleteError(null); }}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {regenResult && <SetupUrlModal data={regenResult} onClose={() => setRegenResult(null)} />}

      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, width: 380 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px', color: 'var(--error, #ef4444)' }}>
              Supprimer définitivement
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.5 }}>
              Supprimer <strong>{deleteTarget.name}</strong> (code <code>{deleteTarget.promoCode}</code>) ?
              Cette action est <strong>irréversible</strong> et efface aussi ses payouts, parrainages, contrats et logs email.
              {deleteTarget.salesCount > 0 && (
                <span style={{ color: 'var(--warning)', display: 'block', marginTop: 8 }}>
                  ⚠️ Cet ambassadeur a {deleteTarget.salesCount} vente(s). La suppression sera refusée — désactivez-le plutôt.
                </span>
              )}
            </p>
            {deleteError && <div style={{ marginTop: 8, color: 'var(--error)', fontSize: 12 }}>{deleteError}</div>}
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
    <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)', marginBottom: 4 }}>
            ✓ {data.name} créé. Envoyez-lui ce lien d&apos;activation :
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
          L&apos;ancien lien et le PIN sont invalidés. Envoyez ce nouveau lien à l&apos;ambassadeur (expire le {new Date(data.expiresAt).toLocaleString('fr-FR')}) — il définira lui-même son nouveau PIN :
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
