'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  createZone,
  toggleZoneActive,
  createSalon,
  toggleSalonActive,
} from '@/actions/admin/salons';
import { startImportJob } from '@/actions/admin/import-jobs';
import type { ImportJobParams } from '@/lib/admin/import-jobs';
import { ImportJobsPanel } from '@/components/dashboard/admin/ImportJobsPanel';
import { FranceImportModal } from '@/components/dashboard/admin/FranceImportModal';
import type { AdminSalon, AdminZoneOverlay } from '@/components/salons/SalonsMap';

const SalonsMap = dynamic(
  () => import('@/components/salons/SalonsMap').then((m) => m.SalonsMap),
  { ssr: false, loading: () => (
    <div style={{ height: '60vh', minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13, background: 'var(--surface-2)', borderRadius: 'var(--radius)' }}>
      Chargement de la carte…
    </div>
  ) }
);

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
  googleEnriched: boolean;
  businessStatus: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | null;
};
type Visit = {
  id: string; salonId: string; salonName: string; salonCity: string;
  ambassadorId: string; ambassadorName: string;
  visitedAt: string; flyerLeft: boolean;
  convinced: 'yes' | 'maybe' | 'no';
  likelihoodRating: number;
  notes: string | null;
  followUpAt: string | null;
  locationVerified: boolean;
  distanceM: number | null;
};

const RATING_LABEL: Record<number, string> = { 1: 'Faible', 2: 'Moyen', 3: 'Fort' };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function SalonsManager({
  cityStats, zones, salons, visits, mapSalons, mapZones,
}: {
  cityStats: CityStats[];
  zones: Zone[];
  salons: Salon[];
  visits: Visit[];
  mapSalons: AdminSalon[];
  mapZones: AdminZoneOverlay[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'overview' | 'map' | 'zones' | 'salons' | 'visits'>('overview');
  const [importCity, setImportCity] = useState('');
  const [franceModalOpen, setFranceModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  // Used only for the few remaining synchronous actions (zone CRUD, salon
  // toggle). Long imports go through background jobs and don't gate the UI.
  const [, startTransition] = useTransition();

  // Zone multi-select drives the bulk-action bar. Reset whenever the zones
  // list changes (e.g. an "import_zones" job finishes and revalidates the page).
  const [selectedZoneIds, setSelectedZoneIds] = useState<Set<string>>(new Set());

  // ── Derived stats (used by quick selectors + per-zone counters) ───────────
  const salonsCountByZone = salons.reduce<Record<string, number>>((acc, s) => {
    if (s.zoneId) acc[s.zoneId] = (acc[s.zoneId] ?? 0) + 1;
    return acc;
  }, {});
  const missingAddressCountByZone = salons.reduce<Record<string, number>>((acc, s) => {
    if (s.zoneId && !s.address) acc[s.zoneId] = (acc[s.zoneId] ?? 0) + 1;
    return acc;
  }, {});
  const unenrichedGoogleByZone = salons.reduce<Record<string, number>>((acc, s) => {
    if (s.zoneId && !s.googleEnriched) acc[s.zoneId] = (acc[s.zoneId] ?? 0) + 1;
    return acc;
  }, {});
  const activeZones = zones.filter((z) => z.isActive);
  const emptyZones = activeZones.filter((z) => (salonsCountByZone[z.id] ?? 0) === 0);
  const zonesWithMissingAddresses = activeZones.filter(
    (z) => (missingAddressCountByZone[z.id] ?? 0) > 0
  );

  // ── Job dispatcher: every long-running action goes through this ───────────
  // Returns immediately — progress shows in ImportJobsPanel above. We don't
  // gate the UI on this so the admin can queue multiple jobs in a row.
  const dispatchJob = (params: ImportJobParams, okMessage?: string) => {
    setFeedback(null);
    startImportJob(params).then((r) => {
      if (!r.ok) setFeedback({ type: 'err', msg: r.error });
      else setFeedback({ type: 'ok', msg: okMessage ?? 'Job lancé — progression dans le panneau ci-dessus.' });
    });
  };

  const runImportZones = () => {
    const city = importCity.trim();
    if (!city) return;
    dispatchJob({ type: 'import_zones', city }, `Import des zones pour "${city}" lancé.`);
  };

  // Quick zone-selectors — fill the multi-select from the action bar.
  const selectAllActive       = () => setSelectedZoneIds(new Set(activeZones.map((z) => z.id)));
  const selectEmptyOnly       = () => setSelectedZoneIds(new Set(emptyZones.map((z) => z.id)));
  const selectMissingAddrOnly = () => setSelectedZoneIds(new Set(zonesWithMissingAddresses.map((z) => z.id)));
  const clearSelection        = () => setSelectedZoneIds(new Set());

  // Bulk runners — operate on the selection.
  const runBulkOnSelection = (
    type: 'import_salons' | 'enrich_addresses' | 'enrich_google' | 'full_import',
    force = false,
  ) => {
    const ids = Array.from(selectedZoneIds);
    if (ids.length === 0) {
      setFeedback({ type: 'err', msg: 'Sélectionnez au moins une zone.' });
      return;
    }
    const params: ImportJobParams =
        type === 'enrich_addresses' ? { type, zoneIds: ids, force }
      : type === 'enrich_google'    ? { type, zoneIds: ids, force }
      : type === 'full_import'      ? { type, zoneIds: ids }
      :                                { type, zoneIds: ids };
    dispatchJob(params, `${ids.length} zone${ids.length > 1 ? 's' : ''} en file d'attente.`);
  };

  // Per-zone shortcut (job with a single zone) — used by the zones grid.
  const runForZone = (
    type: 'import_salons' | 'enrich_addresses' | 'enrich_google' | 'full_import',
    zoneId: string,
    force = false,
  ) => {
    const params: ImportJobParams =
        type === 'enrich_addresses' ? { type, zoneIds: [zoneId], force }
      : type === 'enrich_google'    ? { type, zoneIds: [zoneId], force }
      : type === 'full_import'      ? { type, zoneIds: [zoneId] }
      :                                { type, zoneIds: [zoneId] };
    dispatchJob(params);
  };

  // City-overview bulk: builds a job over every active zone in the city.
  const runBulkForCity = (city: string, kind: 'salons' | 'google' | 'addresses' | 'full') => {
    const ids = activeZones.filter((z) => z.city === city).map((z) => z.id);
    if (ids.length === 0) return;
    const params: ImportJobParams =
        kind === 'salons'    ? { type: 'import_salons',    zoneIds: ids }
      : kind === 'google'    ? { type: 'enrich_google',    zoneIds: ids, force: true }
      : kind === 'addresses' ? { type: 'enrich_addresses', zoneIds: ids, force: true }
      :                        { type: 'full_import',      zoneIds: ids };
    dispatchJob(params, `Job sur ${ids.length} zone${ids.length > 1 ? 's' : ''} de ${city} lancé.`);
  };

  const handleToggleZone = (id: string, active: boolean) => {
    startTransition(async () => {
      const res = await toggleZoneActive(id, active);
      if (!res.ok) setFeedback({ type: 'err', msg: res.error });
    });
  };
  const handleToggleSalon = (id: string, active: boolean) => {
    startTransition(async () => {
      const res = await toggleSalonActive(id, active);
      if (!res.ok) setFeedback({ type: 'err', msg: res.error });
    });
  };

  // When all jobs go terminal, ask Next to refresh the server-rendered counts.
  const refreshServerData = () => router.refresh();

  return (
    <div>
      {/* Live progress for every running / recent job. Hidden when empty. */}
      <ImportJobsPanel onAnyComplete={refreshServerData} />

      {/* Import bar */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: 14, marginBottom: 18,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          Importer une ville ou un département depuis OpenStreetMap
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={importCity}
            onChange={(e) => setImportCity(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runImportZones(); }}
            placeholder="Ex: Paris · Mulhouse · Bas-Rhin · Yvelines…"
            style={{
              flex: 1, minWidth: 200, padding: '8px 12px',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13,
            }}
          />
          <button
            onClick={runImportZones}
            disabled={!importCity.trim()}
            style={{
              padding: '8px 14px', background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-sm)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Importer zones
          </button>
          <button
            onClick={() => setFranceModalOpen(true)}
            title="Importer toutes les communes des régions sélectionnées en tâche de fond"
            style={{
              padding: '8px 14px',
              background: 'linear-gradient(135deg, #0055a4 0%, #ffffff 50%, #ef4135 100%)',
              color: '#000', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              textShadow: '0 0 2px rgba(255,255,255,0.8)',
            }}
          >
            🇫🇷 Toute la France
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.4 }}>
          Ville → arrondissements ou commune entière selon la taille. Département → toutes ses communes.
          Le job tourne côté serveur — vous pouvez fermer cet onglet, il continue.
        </div>

        {/* Zone-selection bulk-actions bar. Visible when zones exist; bulk
            buttons activate as soon as the user picks at least one zone. */}
        {zones.length > 0 && (
          <div style={{
            marginTop: 12, paddingTop: 12,
            borderTop: '1px dashed var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                <strong style={{ color: 'var(--accent)' }}>{selectedZoneIds.size}</strong>
                {' '}zone{selectedZoneIds.size !== 1 ? 's' : ''} sélectionnée{selectedZoneIds.size !== 1 ? 's' : ''}
              </span>
              <button onClick={selectAllActive}       style={chipBtnStyle}>Toutes actives ({activeZones.length})</button>
              {emptyZones.length > 0 && (
                <button onClick={selectEmptyOnly}     style={chipBtnStyle}>Vides ({emptyZones.length})</button>
              )}
              {zonesWithMissingAddresses.length > 0 && (
                <button onClick={selectMissingAddrOnly} style={chipBtnStyle}>Sans adresse ({zonesWithMissingAddresses.length})</button>
              )}
              {selectedZoneIds.size > 0 && (
                <button onClick={clearSelection}      style={chipBtnGhostStyle}>Désélectionner</button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => runBulkOnSelection('full_import')}
                disabled={selectedZoneIds.size === 0}
                title="OSM + enrichissement adresses Nominatim, en chaîne"
                style={primaryActionStyle(selectedZoneIds.size === 0)}
              >🚀 Import complet ({selectedZoneIds.size})</button>
              <button
                onClick={() => runBulkOnSelection('import_salons')}
                disabled={selectedZoneIds.size === 0}
                style={secondaryActionStyle(selectedZoneIds.size === 0)}
              >🔄 OSM seul ({selectedZoneIds.size})</button>
              <button
                onClick={() => runBulkOnSelection('enrich_addresses', false)}
                disabled={selectedZoneIds.size === 0}
                style={secondaryActionStyle(selectedZoneIds.size === 0)}
              >📍 Adresses manquantes</button>
              <button
                onClick={() => runBulkOnSelection('enrich_google', false)}
                disabled={selectedZoneIds.size === 0}
                style={secondaryActionStyle(selectedZoneIds.size === 0)}
              >⚙ Google</button>
            </div>
          </div>
        )}
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
      <div className="dash-tabs" style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {([
          ['overview', `Vue par ville (${cityStats.length})`],
          ['map', `🗺️ Carte (${mapSalons.length})`],
          ['zones', `Zones (${zones.length})`],
          ['salons', `Établissements (${salons.length})`],
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
        <CityOverview cityStats={cityStats} onBulk={runBulkForCity} />
      )}

      {tab === 'map' && (
        <SalonsMap variant="admin" salons={mapSalons} zones={mapZones} />
      )}

      {tab === 'zones' && (
        <ZonesTable
          zones={zones}
          salonsByZone={salonsCountByZone}
          missingAddressByZone={missingAddressCountByZone}
          unenrichedGoogleByZone={unenrichedGoogleByZone}
          selectedZoneIds={selectedZoneIds}
          onToggleSelected={(id, selected) => {
            setSelectedZoneIds((prev) => {
              const next = new Set(prev);
              if (selected) next.add(id); else next.delete(id);
              return next;
            });
          }}
          onRunForZone={runForZone}
          onToggleActive={handleToggleZone}
        />
      )}

      {tab === 'salons' && (
        <SalonsTable salons={salons} zones={zones} onToggle={handleToggleSalon} />
      )}

      {tab === 'visits' && (
        <VisitsTable visits={visits} />
      )}

      <FranceImportModal
        open={franceModalOpen}
        onClose={() => setFranceModalOpen(false)}
        onSubmit={(regions, enrich) =>
          dispatchJob(
            { type: 'import_france', regions, enrich },
            `Import France lancé (${regions.length} région${regions.length > 1 ? 's' : ''}). Vous pouvez fermer cet onglet.`,
          )
        }
      />
    </div>
  );
}

function CityOverview({
  cityStats, onBulk,
}: { cityStats: CityStats[]; onBulk: (city: string, kind: 'salons' | 'google' | 'addresses' | 'full') => void }) {
  if (cityStats.length === 0) {
    return (
      <Empty>Aucune ville importée. Démarrez avec le formulaire ci-dessus.</Empty>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
      {cityStats.map((c) => {
        const coverage = c.salonsTotal === 0 ? 0 : Math.round((c.salonsVisited / c.salonsTotal) * 100);
        const hasZones = c.zonesTotal > 0;
        const hasSalons = c.salonsTotal > 0;
        return (
          <div key={c.city} style={{
            background: 'var(--surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius)', padding: 16,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
              {c.city}
            </div>
            <Row label="Zones" value={c.zonesTotal} />
            <Row label="Établissements" value={c.salonsTotal} />
            <Row label="Visités" value={`${c.salonsVisited} (${coverage}%)`} />
            <Row label="Chauds ⭐3" value={c.salonsHot} highlight />
            <Row label="Visites total" value={c.visitsTotal} />
            <div style={{ marginTop: 10, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${coverage}%`, background: 'var(--accent)' }} />
            </div>

            {hasZones && (
              <div style={{
                marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Actions sur toutes les zones
                </div>
                <button
                  onClick={() => onBulk(c.city, 'full')}
                  style={cityBulkPrimaryStyle}
                >🚀 Import complet (OSM + adresses)</button>
                <button
                  onClick={() => onBulk(c.city, 'salons')}
                  style={cityBulkGhostStyle(false)}
                >🔄 {hasSalons ? 'Ré-importer' : 'Importer'} OSM seulement</button>
                <button
                  onClick={() => onBulk(c.city, 'google')}
                  disabled={!hasSalons}
                  style={cityBulkGhostStyle(!hasSalons)}
                  title={!hasSalons ? 'Importe d\'abord les établissements' : ''}
                >⚙ Enrichir Google (horaires, fermés, note)</button>
                <button
                  onClick={() => onBulk(c.city, 'addresses')}
                  disabled={!hasSalons}
                  style={cityBulkGhostStyle(!hasSalons)}
                  title={!hasSalons ? 'Importe d\'abord les établissements' : ''}
                >📍 Enrichir les adresses (Nominatim)</button>
              </div>
            )}
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

type PerZoneAction = 'import_salons' | 'enrich_addresses' | 'enrich_google' | 'full_import';

function ZonesTable({
  zones, salonsByZone, missingAddressByZone, unenrichedGoogleByZone,
  selectedZoneIds, onToggleSelected, onRunForZone, onToggleActive,
}: {
  zones: Zone[];
  salonsByZone: Record<string, number>;
  missingAddressByZone: Record<string, number>;
  unenrichedGoogleByZone: Record<string, number>;
  selectedZoneIds: Set<string>;
  onToggleSelected: (id: string, selected: boolean) => void;
  onRunForZone: (action: PerZoneAction, zoneId: string, force?: boolean) => void;
  onToggleActive: (id: string, active: boolean) => void;
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
        Aucune zone. Importez une ville ci-dessus ou{' '}
        <button onClick={() => setCreating(true)} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>créez une zone manuellement</button>.
      </Empty>
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'flex-end', marginBottom: 10,
      }}>
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            style={{
              fontSize: 12, padding: '6px 12px', background: 'var(--surface-2)',
              color: 'var(--text-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            }}
          >+ Zone manuelle</button>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="Ville" style={inputStyle} />
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom de zone" style={inputStyle} />
            <button onClick={submit} disabled={busy} style={primaryBtnStyle}>OK</button>
            <button onClick={() => setCreating(false)} style={ghostBtnStyle}>Annuler</button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {zones.map((z) => {
          const count = salonsByZone[z.id] ?? 0;
          const missing = missingAddressByZone[z.id] ?? 0;
          const unenrichedGoogle = unenrichedGoogleByZone[z.id] ?? 0;
          const isSelected = selectedZoneIds.has(z.id);
          return (
            <div key={z.id} style={{
              background: isSelected ? 'var(--accent-muted)' : 'var(--surface)',
              border: `1px solid ${isSelected ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius)',
              padding: 14,
              opacity: z.isActive ? 1 : 0.55,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, minWidth: 0, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onToggleSelected(z.id, e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {z.city}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 2, wordBreak: 'break-word' }}>
                      {z.name}
                    </div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)' }}>
                  <input
                    type="checkbox"
                    checked={z.isActive}
                    onChange={(e) => onToggleActive(z.id, e.target.checked)}
                  />
                  actif
                </label>
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 12, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-3)' }}>
                  Salons : <strong style={{ color: count > 0 ? 'var(--accent)' : 'var(--text)' }}>{count}</strong>
                </span>
                {missing > 0 && (
                  <span style={{ color: 'var(--warning)', fontSize: 11 }}>
                    ⚠ {missing} sans adresse
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  onClick={() => onRunForZone('full_import', z.id)}
                  title="Import OSM puis enrichissement adresses, en chaîne"
                  style={{
                    flex: 1, minWidth: 0,
                    padding: '8px 12px',
                    background: 'var(--accent)', color: '#fff',
                    border: 'none', borderRadius: 'var(--radius-sm)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >🚀 Import complet</button>
                <button
                  onClick={() => onRunForZone('import_salons', z.id)}
                  title="OSM seul, sans enrichissement"
                  style={miniBtnStyle}
                >
                  {count > 0 ? 'OSM ↻' : 'OSM'}
                </button>
                {count > 0 && (
                  <button
                    onClick={() => onRunForZone('enrich_addresses', z.id, missing === 0)}
                    title={missing > 0 ? `${missing} établissement(s) sans adresse` : 'Toutes les adresses sont remplies — relance pour rafraîchir'}
                    style={{
                      padding: '8px 12px',
                      background: missing > 0 ? 'var(--warning-bg)' : 'var(--surface-2)',
                      color: missing > 0 ? 'var(--warning)' : 'var(--text-2)',
                      border: `1px solid ${missing > 0 ? 'var(--warning)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    📍 {missing > 0 ? `Adresses (${missing})` : 'Adresses ↻'}
                  </button>
                )}
                {count > 0 && (
                  <button
                    onClick={() => onRunForZone('enrich_google', z.id, unenrichedGoogle === 0)}
                    title={unenrichedGoogle > 0
                      ? `${unenrichedGoogle} établissement(s) à enrichir via Google`
                      : 'Tous les établissements sont déjà enrichis — relance pour rafraîchir horaires & note'}
                    style={miniBtnStyle}
                  >
                    ⚙ {unenrichedGoogle > 0 ? `Google (${unenrichedGoogle})` : 'Google ↻'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SalonsTable({
  salons, zones, onToggle,
}: { salons: Salon[]; zones: Zone[]; onToggle: (id: string, active: boolean) => void }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ zoneId: '', city: '', name: '', address: '', postalCode: '', phone: '' });
  const [busy, startTr] = useTransition();
  const zoneById = new Map(zones.map((z) => [z.id, z]));

  // Filters — kept entirely client-side. The page already streams the full
  // salons list (it's bounded by zone count, not by user activity).
  const [query, setQuery]       = useState('');
  const [cityFilter, setCityF]  = useState<string>('');
  const [addrFilter, setAddrF]  = useState<'all' | 'with' | 'without'>('all');
  const [googleFilter, setGF]   = useState<'all' | 'enriched' | 'not_enriched'>('all');
  const [statusFilter, setSF]   = useState<'all' | 'active' | 'inactive' | 'closed'>('all');

  // Cap rendered DOM rows so a full-France dataset doesn't freeze the tab.
  // The filtered list can be huge; we only paint a slice and grow on demand.
  const RENDER_STEP = 300;
  const [renderLimit, setRenderLimit] = useState(RENDER_STEP);

  const allCities = useMemo(() => {
    const set = new Set<string>();
    for (const s of salons) set.add(s.city);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [salons]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return salons.filter((s) => {
      if (cityFilter && s.city !== cityFilter) return false;
      if (addrFilter === 'with' && !s.address) return false;
      if (addrFilter === 'without' && s.address) return false;
      if (googleFilter === 'enriched'     && !s.googleEnriched) return false;
      if (googleFilter === 'not_enriched' &&  s.googleEnriched) return false;
      if (statusFilter === 'active'   && !s.isActive) return false;
      if (statusFilter === 'inactive' &&  s.isActive) return false;
      if (statusFilter === 'closed'   && s.businessStatus !== 'CLOSED_PERMANENTLY') return false;
      if (q) {
        const hay = `${s.name} ${s.address ?? ''} ${s.city} ${s.phone ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [salons, query, cityFilter, addrFilter, googleFilter, statusFilter]);

  // Reset the render cap whenever the filtered set changes, so a new search
  // always starts from the top instead of inheriting a large previous limit.
  const [shownFor, setShownFor] = useState(visible);
  if (shownFor !== visible) {
    setShownFor(visible);
    setRenderLimit(RENDER_STEP);
  }
  const shownSalons = visible.slice(0, renderLimit);

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
        Aucun établissement. Importez une zone depuis OSM ou{' '}
        <button onClick={() => setCreating(true)} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>ajoutez-en un manuellement</button>.
      </Empty>
    );
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', overflow: 'hidden',
    }}>
      {/* Filter bar */}
      <div style={{
        padding: 10, borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <input
          placeholder="Recherche nom / adresse / téléphone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...inputStyle, flex: '1 1 200px', minWidth: 160 }}
        />
        <select value={cityFilter} onChange={(e) => setCityF(e.target.value)} style={inputStyle}>
          <option value="">Toutes villes</option>
          {allCities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={addrFilter} onChange={(e) => setAddrF(e.target.value as typeof addrFilter)} style={inputStyle}>
          <option value="all">Adresse : toutes</option>
          <option value="with">Avec adresse</option>
          <option value="without">Sans adresse</option>
        </select>
        <select value={googleFilter} onChange={(e) => setGF(e.target.value as typeof googleFilter)} style={inputStyle}>
          <option value="all">Google : tous</option>
          <option value="enriched">Enrichis</option>
          <option value="not_enriched">Non enrichis</option>
        </select>
        <select value={statusFilter} onChange={(e) => setSF(e.target.value as typeof statusFilter)} style={inputStyle}>
          <option value="all">Statut : tous</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
          <option value="closed">Fermés Google</option>
        </select>
        <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
          {visible.length} / {salons.length}
        </span>
        {!creating ? (
          <button onClick={() => setCreating(true)} style={miniBtnStyle}>+ Établissement manuel</button>
        ) : null}
      </div>

      {creating && (
        <div style={{ padding: 10, borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
        </div>
      )}

      <div style={{ maxHeight: 600, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)' }}>
            <tr><Th>Ville</Th><Th>Zone</Th><Th>Nom</Th><Th>Adresse</Th><Th>Tél</Th><Th>Visites</Th><Th>Actif</Th></tr>
          </thead>
          <tbody>
            {shownSalons.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <Td>{s.city}</Td>
                <Td>{s.zoneId ? zoneById.get(s.zoneId)?.name ?? '—' : <span style={{ color: 'var(--text-3)' }}>—</span>}</Td>
                <Td><strong>{s.name}</strong></Td>
                <Td>{s.address ?? <span style={{ color: 'var(--warning)' }}>— manquante</span>}{s.postalCode ? ` · ${s.postalCode}` : ''}</Td>
                <Td>{s.phone ?? '—'}</Td>
                <Td>{s.visitCount}</Td>
                <Td>
                  <input type="checkbox" checked={s.isActive}
                    onChange={(e) => onToggle(s.id, e.target.checked)} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length > renderLimit && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => setRenderLimit((n) => n + RENDER_STEP)}
              style={miniBtnStyle}
            >
              Afficher plus ({shownSalons.length} / {visible.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function VisitsTable({ visits }: { visits: Visit[] }) {
  const RENDER_STEP = 300;
  const [renderLimit, setRenderLimit] = useState(RENDER_STEP);
  const shown = visits.slice(0, renderLimit);
  if (visits.length === 0) return <Empty>Aucune visite enregistrée pour le moment.</Empty>;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', overflow: 'hidden',
    }}>
      <div style={{ maxHeight: 600, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)' }}>
            <tr><Th>Date</Th><Th>Ville</Th><Th>Établissement</Th><Th>Ambassadeur</Th><Th>GPS</Th><Th>Flyer</Th><Th>Convaincu</Th><Th>Note</Th><Th>Relance</Th><Th>Notes</Th></tr>
          </thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <Td>{fmtDate(v.visitedAt)}</Td>
                <Td>{v.salonCity}</Td>
                <Td><strong>{v.salonName}</strong></Td>
                <Td>{v.ambassadorName}</Td>
                <Td><VisitVerifBadge verified={v.locationVerified} distanceM={v.distanceM} /></Td>
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
        {visits.length > renderLimit && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => setRenderLimit((n) => n + RENDER_STEP)}
              style={miniBtnStyle}
            >
              Afficher plus ({shown.length} / {visits.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// GPS check-in result for a visit: verified (within range), out-of-range
// (logged with a position but too far), or no position captured at all.
function VisitVerifBadge({ verified, distanceM }: { verified: boolean; distanceM: number | null }) {
  const style = verified
    ? {
        bg: 'var(--success-bg)', fg: 'var(--success)', bd: 'var(--success)',
        label: distanceM != null ? `📍 ${distanceM} m` : '📍 Vérifié',
        title: distanceM != null ? `Visite à ${distanceM} m de l’établissement` : 'Visite vérifiée par GPS',
      }
    : distanceM != null
      ? {
          bg: 'var(--warning-bg)', fg: 'var(--warning)', bd: 'var(--warning)',
          label: `⚠ ${distanceM} m`,
          title: `Visite enregistrée à ${distanceM} m de l’établissement — hors du rayon de vérification`,
        }
      : {
          bg: 'var(--surface-2)', fg: 'var(--text-3)', bd: 'var(--border)',
          label: '— sans GPS',
          title: 'Aucune position GPS capturée pour cette visite',
        };
  return (
    <span
      title={style.title}
      style={{
        fontSize: 11, padding: '2px 7px', borderRadius: 99, fontWeight: 700,
        background: style.bg, color: style.fg, border: `1px solid ${style.bd}`,
        whiteSpace: 'nowrap',
      }}
    >
      {style.label}
    </span>
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
const cityBulkPrimaryStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  background: 'var(--accent)', color: '#fff',
  border: 'none', borderRadius: 'var(--radius-sm)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const cityBulkGhostStyle = (disabled: boolean): React.CSSProperties => ({
  width: '100%', padding: '7px 10px',
  background: 'var(--surface-2)', color: 'var(--text-2)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  fontSize: 12, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.55 : 1,
  whiteSpace: 'nowrap',
});

// Selection-bar buttons in the import header
const chipBtnStyle: React.CSSProperties = {
  padding: '4px 10px', background: 'var(--surface-2)', color: 'var(--text-2)',
  border: '1px solid var(--border)', borderRadius: 99,
  fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};
const chipBtnGhostStyle: React.CSSProperties = {
  ...chipBtnStyle, background: 'transparent', color: 'var(--text-3)',
};
const primaryActionStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 14px',
  background: disabled ? 'var(--surface-3)' : 'var(--accent)',
  color: disabled ? 'var(--text-3)' : '#fff',
  border: 'none', borderRadius: 'var(--radius-sm)',
  fontSize: 13, fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  whiteSpace: 'nowrap',
});
const secondaryActionStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 14px',
  background: disabled ? 'var(--surface-3)' : 'var(--surface-2)',
  color: disabled ? 'var(--text-3)' : 'var(--text-2)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  fontSize: 12, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  whiteSpace: 'nowrap',
});
