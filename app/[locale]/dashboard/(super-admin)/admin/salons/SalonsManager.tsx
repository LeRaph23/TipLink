'use client';

import { useState, useTransition } from 'react';
import {
  importZonesFromOsm,
  importSalonsForZone,
  createZone,
  toggleZoneActive,
  releaseZoneClaim,
  createSalon,
  toggleSalonActive,
} from '@/actions/admin/salons';

type CityStats = {
  city: string;
  zonesTotal: number;
  salonsTotal: number;
  salonsVisited: number;
  salonsHot: number;
  visitsTotal: number;
};

type Zone = { id: string; city: string; name: string; isActive: boolean };
type Salon = {
  id: string; zoneId: string | null; city: string; name: string;
  address: string | null; postalCode: string | null; phone: string | null;
  isActive: boolean; visitCount: number;
};
type Claim = { zoneId: string; ambassadorId: string; ambassadorName: string; claimedAt: string };
type Visit = {
  id: string; salonId: string; salonName: string; salonCity: string;
  ambassadorId: string; ambassadorName: string;
  visitedAt: string; flyerLeft: boolean;
  convinced: 'yes' | 'maybe' | 'no';
  likelihoodRating: number;
  notes: string | null;
  followUpAt: string | null;
};

const RATING_LABEL: Record<number, string> = { 1: 'Faible', 2: 'Moyen', 3: 'Fort' };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function SalonsManager({
  cityStats, zones, salons, activeClaims, visits,
}: {
  cityStats: CityStats[];
  zones: Zone[];
  salons: Salon[];
  activeClaims: Claim[];
  visits: Visit[];
}) {
  const [tab, setTab] = useState<'overview' | 'zones' | 'salons' | 'visits'>('overview');
  const [importCity, setImportCity] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const claimByZone = new Map(activeClaims.map((c) => [c.zoneId, c]));

  const runImportZones = () => {
    if (!importCity.trim()) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await importZonesFromOsm(importCity.trim());
      if (res.ok) {
        setFeedback({ type: 'ok', msg: `${res.inserted} zone(s) importée(s), ${res.skipped} déjà existante(s).` });
      } else {
        setFeedback({ type: 'err', msg: res.error });
      }
    });
  };

  const runImportSalons = (zoneId: string) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await importSalonsForZone(zoneId);
      if (res.ok) {
        setFeedback({ type: 'ok', msg: `${res.inserted} salon(s) importé(s), ${res.skipped} ignoré(s).` });
      } else {
        setFeedback({ type: 'err', msg: res.error });
      }
    });
  };

  const handleToggleZone = (id: string, active: boolean) => {
    startTransition(async () => {
      const res = await toggleZoneActive(id, active);
      if (!res.ok) setFeedback({ type: 'err', msg: res.error });
    });
  };
  const handleReleaseClaim = (zoneId: string) => {
    if (!confirm('Forcer la libération de cette zone ?')) return;
    startTransition(async () => {
      const res = await releaseZoneClaim(zoneId);
      if (!res.ok) setFeedback({ type: 'err', msg: res.error });
    });
  };
  const handleToggleSalon = (id: string, active: boolean) => {
    startTransition(async () => {
      const res = await toggleSalonActive(id, active);
      if (!res.ok) setFeedback({ type: 'err', msg: res.error });
    });
  };

  return (
    <div>
      {/* Import bar */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: 14, marginBottom: 18,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          Importer une ville depuis OpenStreetMap
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={importCity}
            onChange={(e) => setImportCity(e.target.value)}
            placeholder="Ex: Paris, Lyon, Bordeaux…"
            style={{
              flex: 1, minWidth: 200, padding: '8px 12px',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13,
            }}
          />
          <button
            onClick={runImportZones}
            disabled={pending || !importCity.trim()}
            style={{
              padding: '8px 14px', background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-sm)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {pending ? 'Import…' : 'Importer zones'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.4 }}>
          Récupère les arrondissements / communes via OSM, puis importe les salons par zone individuellement.
        </div>
      </div>

      {feedback && (
        <div style={{
          background: feedback.type === 'ok' ? 'var(--success-bg)' : 'var(--error-bg)',
          color: feedback.type === 'ok' ? 'var(--success)' : 'var(--error)',
          borderRadius: 'var(--radius-sm)', padding: '10px 14px',
          fontSize: 13, marginBottom: 18,
        }}>
          {feedback.msg}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {([
          ['overview', `Vue par ville (${cityStats.length})`],
          ['zones', `Zones (${zones.length})`],
          ['salons', `Salons (${salons.length})`],
          ['visits', `Visites (${visits.length})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '8px 14px', background: 'transparent',
              border: 'none', borderBottom: `2px solid ${tab === key ? 'var(--accent)' : 'transparent'}`,
              color: tab === key ? 'var(--accent)' : 'var(--text-3)',
              fontSize: 13, fontWeight: tab === key ? 700 : 500, cursor: 'pointer',
            }}
          >{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <CityOverview cityStats={cityStats} />
      )}

      {tab === 'zones' && (
        <ZonesTable
          zones={zones}
          claimByZone={claimByZone}
          salonsByZone={salons.reduce<Record<string, number>>((acc, s) => {
            if (s.zoneId) acc[s.zoneId] = (acc[s.zoneId] ?? 0) + 1;
            return acc;
          }, {})}
          onImportSalons={runImportSalons}
          onToggleActive={handleToggleZone}
          onReleaseClaim={handleReleaseClaim}
          pending={pending}
        />
      )}

      {tab === 'salons' && (
        <SalonsTable salons={salons} zones={zones} onToggle={handleToggleSalon} pending={pending} />
      )}

      {tab === 'visits' && (
        <VisitsTable visits={visits} />
      )}
    </div>
  );
}

function CityOverview({ cityStats }: { cityStats: CityStats[] }) {
  if (cityStats.length === 0) {
    return (
      <Empty>Aucune ville importée. Démarre avec le formulaire ci-dessus.</Empty>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
      {cityStats.map((c) => {
        const coverage = c.salonsTotal === 0 ? 0 : Math.round((c.salonsVisited / c.salonsTotal) * 100);
        return (
          <div key={c.city} style={{
            background: 'var(--surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius)', padding: 16,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
              {c.city}
            </div>
            <Row label="Zones" value={c.zonesTotal} />
            <Row label="Salons" value={c.salonsTotal} />
            <Row label="Visités" value={`${c.salonsVisited} (${coverage}%)`} />
            <Row label="Chauds ⭐3" value={c.salonsHot} highlight />
            <Row label="Visites total" value={c.visitsTotal} />
            <div style={{ marginTop: 10, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${coverage}%`, background: 'var(--accent)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <span style={{ color: highlight ? 'var(--accent)' : 'var(--text)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13,
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)',
    }}>{children}</div>
  );
}

function ZonesTable({
  zones, claimByZone, salonsByZone, onImportSalons, onToggleActive, onReleaseClaim, pending,
}: {
  zones: Zone[];
  claimByZone: Map<string, Claim>;
  salonsByZone: Record<string, number>;
  onImportSalons: (zoneId: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onReleaseClaim: (zoneId: string) => void;
  pending: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [newCity, setNewCity] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, startTr] = useTransition();

  const submit = () => {
    if (!newCity.trim() || !newName.trim()) return;
    startTr(async () => {
      const r = await createZone(newCity, newName);
      if (r.ok) {
        setCreating(false);
        setNewCity(''); setNewName('');
      } else {
        alert(r.error);
      }
    });
  };

  if (zones.length === 0 && !creating) {
    return (
      <Empty>
        Aucune zone. Importe une ville ci-dessus ou{' '}
        <button onClick={() => setCreating(true)} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>crée une zone manuellement</button>.
      </Empty>
    );
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 10, borderBottom: '1px solid var(--border-subtle)' }}>
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            style={{
              fontSize: 12, padding: '5px 10px', background: 'var(--surface-2)',
              color: 'var(--text-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            }}
          >+ Zone manuelle</button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="Ville" style={inputStyle} />
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom de zone" style={inputStyle} />
            <button onClick={submit} disabled={busy} style={primaryBtnStyle}>OK</button>
            <button onClick={() => setCreating(false)} style={ghostBtnStyle}>Annuler</button>
          </div>
        )}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--surface-2)' }}>
            <Th>Ville</Th><Th>Zone</Th><Th>Salons</Th><Th>Réservée par</Th><Th>Actif</Th><Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {zones.map((z) => {
            const claim = claimByZone.get(z.id);
            return (
              <tr key={z.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <Td>{z.city}</Td>
                <Td><strong>{z.name}</strong></Td>
                <Td>{salonsByZone[z.id] ?? 0}</Td>
                <Td>{claim ? <span style={{ color: 'var(--accent)' }}>{claim.ambassadorName} <span style={{ color: 'var(--text-3)' }}>({fmtDateShort(claim.claimedAt)})</span></span> : <span style={{ color: 'var(--text-3)' }}>—</span>}</Td>
                <Td>
                  <input
                    type="checkbox"
                    checked={z.isActive}
                    onChange={(e) => onToggleActive(z.id, e.target.checked)}
                    disabled={pending}
                  />
                </Td>
                <Td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => onImportSalons(z.id)} disabled={pending} style={miniBtnStyle}>
                      Import salons
                    </button>
                    {claim && (
                      <button onClick={() => onReleaseClaim(z.id)} disabled={pending} style={miniDangerBtnStyle}>
                        Libérer
                      </button>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SalonsTable({
  salons, zones, onToggle, pending,
}: { salons: Salon[]; zones: Zone[]; onToggle: (id: string, active: boolean) => void; pending: boolean }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ zoneId: '', city: '', name: '', address: '', postalCode: '', phone: '' });
  const [busy, startTr] = useTransition();
  const zoneById = new Map(zones.map((z) => [z.id, z]));

  const submit = () => {
    if (!form.name.trim() || !form.city.trim()) return;
    startTr(async () => {
      const r = await createSalon({
        zoneId: form.zoneId || null,
        city: form.city, name: form.name,
        address: form.address || null,
        postalCode: form.postalCode || null,
        phone: form.phone || null,
      });
      if (r.ok) {
        setCreating(false);
        setForm({ zoneId: '', city: '', name: '', address: '', postalCode: '', phone: '' });
      } else {
        alert(r.error);
      }
    });
  };

  if (salons.length === 0 && !creating) {
    return (
      <Empty>
        Aucun salon. Importe une zone depuis OSM ou{' '}
        <button onClick={() => setCreating(true)} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>ajoute-en un manuellement</button>.
      </Empty>
    );
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', overflow: 'hidden',
    }}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {!creating ? (
          <button onClick={() => setCreating(true)} style={miniBtnStyle}>+ Salon manuel</button>
        ) : (
          <>
            <select value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })} style={inputStyle}>
              <option value="">— Aucune zone —</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.city} · {z.name}</option>)}
            </select>
            <input placeholder="Ville" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={inputStyle} />
            <input placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input placeholder="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={inputStyle} />
            <input placeholder="CP" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} style={{ ...inputStyle, width: 70 }} />
            <input placeholder="Tél" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
            <button onClick={submit} disabled={busy} style={primaryBtnStyle}>OK</button>
            <button onClick={() => setCreating(false)} style={ghostBtnStyle}>Annuler</button>
          </>
        )}
      </div>
      <div style={{ maxHeight: 600, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)' }}>
            <tr><Th>Ville</Th><Th>Zone</Th><Th>Nom</Th><Th>Adresse</Th><Th>Tél</Th><Th>Visites</Th><Th>Actif</Th></tr>
          </thead>
          <tbody>
            {salons.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <Td>{s.city}</Td>
                <Td>{s.zoneId ? zoneById.get(s.zoneId)?.name ?? '—' : <span style={{ color: 'var(--text-3)' }}>—</span>}</Td>
                <Td><strong>{s.name}</strong></Td>
                <Td>{s.address ?? '—'}{s.postalCode ? ` · ${s.postalCode}` : ''}</Td>
                <Td>{s.phone ?? '—'}</Td>
                <Td>{s.visitCount}</Td>
                <Td>
                  <input type="checkbox" checked={s.isActive}
                    onChange={(e) => onToggle(s.id, e.target.checked)} disabled={pending} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VisitsTable({ visits }: { visits: Visit[] }) {
  if (visits.length === 0) return <Empty>Aucune visite enregistrée pour le moment.</Empty>;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', overflow: 'hidden',
    }}>
      <div style={{ maxHeight: 600, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)' }}>
            <tr><Th>Date</Th><Th>Ville</Th><Th>Salon</Th><Th>Ambassadeur</Th><Th>Flyer</Th><Th>Convaincu</Th><Th>Note</Th><Th>Relance</Th><Th>Notes</Th></tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <Td>{fmtDate(v.visitedAt)}</Td>
                <Td>{v.salonCity}</Td>
                <Td><strong>{v.salonName}</strong></Td>
                <Td>{v.ambassadorName}</Td>
                <Td>{v.flyerLeft ? '🪧' : '—'}</Td>
                <Td>{v.convinced === 'yes' ? '✓ oui' : v.convinced === 'maybe' ? '~ peut-être' : 'non'}</Td>
                <Td>
                  <span style={{
                    fontSize: 11, padding: '2px 7px', borderRadius: 99,
                    fontWeight: 700,
                    background: v.likelihoodRating === 3 ? 'var(--success-bg)' : v.likelihoodRating === 2 ? 'var(--warning-bg)' : 'var(--surface-2)',
                    color: v.likelihoodRating === 3 ? 'var(--success)' : v.likelihoodRating === 2 ? 'var(--warning)' : 'var(--text-3)',
                    border: `1px solid ${v.likelihoodRating === 3 ? 'var(--success)' : v.likelihoodRating === 2 ? 'var(--warning)' : 'var(--border)'}`,
                  }}>
                    {v.likelihoodRating}/3 · {RATING_LABEL[v.likelihoodRating]}
                  </span>
                </Td>
                <Td>{v.followUpAt ? fmtDateShort(v.followUpAt) : '—'}</Td>
                <Td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.notes ?? ''}>
                  {v.notes ?? '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{
    textAlign: 'left', padding: '10px 12px', fontSize: 11,
    fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em',
    whiteSpace: 'nowrap',
  }}>{children}</th>;
}
function Td({ children, style, title }: { children: React.ReactNode; style?: React.CSSProperties; title?: string }) {
  return <td title={title} style={{ padding: '8px 12px', color: 'var(--text)', verticalAlign: 'middle', ...style }}>{children}</td>;
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: 12,
};
const primaryBtnStyle: React.CSSProperties = {
  padding: '6px 14px', background: 'var(--accent)', color: '#fff',
  border: 'none', borderRadius: 'var(--radius-sm)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
const ghostBtnStyle: React.CSSProperties = {
  padding: '6px 10px', background: 'transparent', color: 'var(--text-3)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  fontSize: 12, cursor: 'pointer',
};
const miniBtnStyle: React.CSSProperties = {
  padding: '5px 10px', background: 'var(--surface-2)', color: 'var(--text-2)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
};
const miniDangerBtnStyle: React.CSSProperties = {
  ...miniBtnStyle, color: 'var(--error)', borderColor: 'var(--error)',
};
