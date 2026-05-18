'use client';

import { useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import {
  importZonesFromOsm,
  importSalonsForZone,
  enrichSalonAddressesForZone,
  enrichSalonsViaGoogleForZone,
  createZone,
  toggleZoneActive,
  releaseZoneClaim,
  createSalon,
  toggleSalonActive,
} from '@/actions/admin/salons';
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
type Claim = { zoneId: string; ambassadorId: string; ambassadorName: string; claimedAt: string };
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
  cityStats, zones, salons, activeClaims, visits, mapSalons, mapZones,
}: {
  cityStats: CityStats[];
  zones: Zone[];
  salons: Salon[];
  activeClaims: Claim[];
  visits: Visit[];
  mapSalons: AdminSalon[];
  mapZones: AdminZoneOverlay[];
}) {
  const [tab, setTab] = useState<'overview' | 'map' | 'zones' | 'salons' | 'visits'>('overview');
  const [importCity, setImportCity] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();
  // Live progress of the "re-import everything" run (null when idle).
  const [reimport, setReimport] = useState<
    { done: number; total: number; imported: number; failed: number } | null
  >(null);

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

  // Compute empty-zones list eagerly so the button can advertise the count.
  const salonsCountByZone = salons.reduce<Record<string, number>>((acc, s) => {
    if (s.zoneId) acc[s.zoneId] = (acc[s.zoneId] ?? 0) + 1;
    return acc;
  }, {});
  const emptyZones = zones.filter((z) => z.isActive && (salonsCountByZone[z.id] ?? 0) === 0);
  const activeZones = zones.filter((z) => z.isActive);

  // Zones that still have at least one salon missing an address.
  const missingAddressCountByZone = salons.reduce<Record<string, number>>((acc, s) => {
    if (s.zoneId && !s.address) acc[s.zoneId] = (acc[s.zoneId] ?? 0) + 1;
    return acc;
  }, {});
  const zonesWithMissingAddresses = zones.filter(
    (z) => z.isActive && (missingAddressCountByZone[z.id] ?? 0) > 0
  );
  const totalMissingAddresses = Object.values(missingAddressCountByZone).reduce((a, b) => a + b, 0);

  const runImportAllEmptyZones = () => {
    if (emptyZones.length === 0) return;
    if (!confirm(
      `Importer les salons des ${emptyZones.length} zones encore vides ? Cela peut prendre ~${Math.ceil(emptyZones.length * 1.5 / 60)} min.`
    )) return;

    setFeedback({ type: 'ok', msg: `Import en cours sur ${emptyZones.length} zones…` });
    startTransition(async () => {
      let totalInserted = 0;
      let totalSkipped = 0;
      let failed = 0;
      for (const z of emptyZones) {
        try {
          const r = await importSalonsForZone(z.id);
          if (r.ok) { totalInserted += r.inserted; totalSkipped += r.skipped; }
          else failed += 1;
        } catch {
          failed += 1;
        }
        await new Promise((r) => setTimeout(r, 800));
      }
      setFeedback({
        type: failed === 0 ? 'ok' : 'err',
        msg: `${emptyZones.length - failed}/${emptyZones.length} zones traitées · ${totalInserted} salons importés, ${totalSkipped} ignorés${failed ? ` · ${failed} échec(s)` : ''}.`,
      });
    });
  };

  // Re-import every active zone, one at a time, with a live progress bar.
  // Driven from the client so each zone is its own short server call.
  const runReimportAll = async () => {
    if (activeZones.length === 0 || reimport) return;
    if (!confirm(
      `Réimporter les établissements des ${activeZones.length} zones actives depuis OpenStreetMap ? ` +
      `Cela peut prendre ~${Math.ceil((activeZones.length * 2) / 60)} min — garde cet onglet ouvert.`
    )) return;

    setFeedback(null);
    setReimport({ done: 0, total: activeZones.length, imported: 0, failed: 0 });
    let imported = 0;
    let failed = 0;
    for (let i = 0; i < activeZones.length; i++) {
      try {
        const r = await importSalonsForZone(activeZones[i].id);
        if (r.ok) imported += r.inserted;
        else failed += 1;
      } catch {
        failed += 1;
      }
      setReimport({ done: i + 1, total: activeZones.length, imported, failed });
      if (i + 1 < activeZones.length) await new Promise((res) => setTimeout(res, 600));
    }
    setReimport(null);
    setFeedback({
      type: failed === 0 ? 'ok' : 'err',
      msg: `Ré-import terminé : ${imported} nouvel(s) établissement(s) importé(s) sur ${activeZones.length} zones${failed ? ` · ${failed} zone(s) en échec` : ''}.`,
    });
  };

  const runEnrichAllMissingAddresses = () => {
    if (zonesWithMissingAddresses.length === 0) return;
    // Nominatim throttles to 1 req/s, so the cost in seconds ≈ total missing.
    const seconds = totalMissingAddresses;
    if (!confirm(
      `Enrichir les adresses des ${totalMissingAddresses} salons manquants via Nominatim ? ` +
      `Cela peut prendre ~${Math.ceil(seconds / 60)} min (limite 1 req/s).`
    )) return;

    setFeedback({ type: 'ok', msg: `Enrichissement de ${totalMissingAddresses} adresses en cours…` });
    startTransition(async () => {
      let totalEnriched = 0;
      let totalSkipped = 0;
      let failed = 0;
      for (const z of zonesWithMissingAddresses) {
        try {
          const r = await enrichSalonAddressesForZone(z.id); // force=false → only missing
          if (r.ok) { totalEnriched += r.enriched; totalSkipped += r.skipped; }
          else failed += 1;
        } catch {
          failed += 1;
        }
        // Short pause between zones; Nominatim is the bottleneck inside.
        await new Promise((r) => setTimeout(r, 300));
      }
      setFeedback({
        type: failed === 0 ? 'ok' : 'err',
        msg: `${zonesWithMissingAddresses.length - failed}/${zonesWithMissingAddresses.length} zones traitées · ${totalEnriched} adresses ajoutées, ${totalSkipped} introuvables${failed ? ` · ${failed} échec(s)` : ''}.`,
      });
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
  const runEnrichAddresses = (zoneId: string, force = false) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await enrichSalonAddressesForZone(zoneId, { force });
      if (res.ok) {
        setFeedback({
          type: 'ok',
          msg: res.total === 0
            ? 'Aucune adresse à enrichir.'
            : `${res.enriched} adresse(s) ${force ? 'mises à jour' : 'ajoutées'} via Nominatim, ${res.skipped} introuvable(s).`,
        });
      } else {
        setFeedback({ type: 'err', msg: res.error });
      }
    });
  };
  const runEnrichGoogle = (zoneId: string, force = false) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await enrichSalonsViaGoogleForZone(zoneId, { force });
      if (res.ok) {
        if (res.total === 0) {
          setFeedback({ type: 'ok', msg: 'Aucun salon à enrichir.' });
        } else {
          const base = `${res.matched}/${res.total} salons enrichis. ${res.closed} fermé(s) définitivement → désactivés. ${res.missing} introuvable(s) sur Google.`;
          const suffix = res.apiError ? ` ⚠ Erreur API : ${res.apiError}` : '';
          setFeedback({
            type: res.apiError ? 'err' : 'ok',
            msg: base + suffix,
          });
        }
      } else {
        setFeedback({ type: 'err', msg: res.error });
      }
    });
  };

  // ── City-level bulk runners ──────────────────────────────────────────────
  type Bulk = 'salons' | 'google' | 'addresses';

  const runBulkForCity = (city: string, kind: Bulk) => {
    const zonesForCity = zones.filter((z) => z.city === city && z.isActive);
    if (zonesForCity.length === 0) return;
    const labels: Record<Bulk, string> = {
      salons:    `Réimporter les salons des ${zonesForCity.length} zones de ${city} ?`,
      google:    `Ré-enrichir Google sur les ${zonesForCity.length} zones de ${city} ? (consomme du quota API)`,
      addresses: `Ré-enrichir les adresses des ${zonesForCity.length} zones de ${city} via Nominatim ?`,
    };
    if (!confirm(labels[kind])) return;

    setFeedback({ type: 'ok', msg: `Traitement de ${zonesForCity.length} zones en cours…` });
    startTransition(async () => {
      let okCount = 0, failed = 0;
      const totals = { matched: 0, missing: 0, closed: 0, inserted: 0, skipped: 0, enriched: 0 };

      for (const z of zonesForCity) {
        let r;
        try {
          if (kind === 'salons')     r = await importSalonsForZone(z.id);
          else if (kind === 'google') r = await enrichSalonsViaGoogleForZone(z.id, { force: true });
          else                        r = await enrichSalonAddressesForZone(z.id, { force: true });
        } catch (e) {
          r = { ok: false, error: e instanceof Error ? e.message : 'Erreur' } as const;
        }
        if (r.ok) {
          okCount += 1;
          if (kind === 'salons')        { totals.inserted += (r as { inserted: number }).inserted; totals.skipped += (r as { skipped: number }).skipped; }
          else if (kind === 'google')   { totals.matched += (r as { matched: number }).matched; totals.missing += (r as { missing: number }).missing; totals.closed += (r as { closed: number }).closed; }
          else                          { totals.enriched += (r as { enriched: number }).enriched; }
        } else {
          failed += 1;
        }
        await new Promise((r) => setTimeout(r, 800));
      }

      const summary =
        kind === 'salons'   ? `${okCount}/${zonesForCity.length} zones · ${totals.inserted} salons importés, ${totals.skipped} ignorés`
      : kind === 'google'   ? `${okCount}/${zonesForCity.length} zones · ${totals.matched} matchés, ${totals.closed} fermés, ${totals.missing} introuvables`
      :                       `${okCount}/${zonesForCity.length} zones · ${totals.enriched} adresses enrichies`;

      setFeedback({
        type: failed === 0 ? 'ok' : 'err',
        msg: summary + (failed ? ` · ${failed} échec(s)` : ''),
      });
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
          Importer une ville ou un département depuis OpenStreetMap
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={importCity}
            onChange={(e) => setImportCity(e.target.value)}
            placeholder="Ex: Paris · Mulhouse · Bas-Rhin · Yvelines…"
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
          Ville → arrondissements ou commune entière selon la taille. Département → toutes ses communes.
        </div>

        {zones.length > 0 && (
          <div style={{
            marginTop: 12, paddingTop: 12,
            borderTop: '1px dashed var(--border-subtle)',
          }}>
            {reimport ? (
              <div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6,
                  fontSize: 12, color: 'var(--text-2)', marginBottom: 6,
                }}>
                  <span><strong>Ré-import en cours…</strong> Zone {reimport.done} / {reimport.total}</span>
                  <span>
                    <strong style={{ color: 'var(--accent)' }}>{reimport.imported}</strong>{' '}
                    établissement{reimport.imported !== 1 ? 's' : ''} importé{reimport.imported !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.round((reimport.done / reimport.total) * 100)}%`,
                    background: 'var(--accent)', borderRadius: 99,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                {reimport.failed > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 4 }}>
                    {reimport.failed} zone(s) en échec jusqu&apos;ici (OSM nous rate-limit) — à relancer plus tard.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: 'var(--text-2)' }}>
                  Réimporte les établissements (coiffure, esthétique, restaurants, cafés, bars) des{' '}
                  <strong>{activeZones.length}</strong> zone{activeZones.length > 1 ? 's' : ''} active
                  {activeZones.length > 1 ? 's' : ''} depuis OpenStreetMap.
                </div>
                <button
                  onClick={runReimportAll}
                  disabled={pending || activeZones.length === 0}
                  style={{
                    padding: '8px 14px', background: 'var(--accent)', color: '#fff',
                    border: 'none', borderRadius: 'var(--radius-sm)',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  🔄 Tout réimporter ({activeZones.length})
                </button>
              </div>
            )}
          </div>
        )}

        {emptyZones.length > 0 && (
          <div style={{
            marginTop: 12, paddingTop: 12,
            borderTop: '1px dashed var(--border-subtle)',
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: 'var(--text-2)' }}>
              <strong style={{ color: 'var(--accent)' }}>{emptyZones.length}</strong> zone
              {emptyZones.length > 1 ? 's' : ''} sans aucun salon importé pour l&apos;instant.
            </div>
            <button
              onClick={runImportAllEmptyZones}
              disabled={pending}
              style={{
                padding: '8px 14px', background: 'var(--accent-muted)', color: 'var(--accent)',
                border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              ⚡ Importer les salons des zones vides ({emptyZones.length})
            </button>
          </div>
        )}

        {zonesWithMissingAddresses.length > 0 && (
          <div style={{
            marginTop: 12, paddingTop: 12,
            borderTop: '1px dashed var(--border-subtle)',
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: 'var(--text-2)' }}>
              <strong style={{ color: 'var(--warning)' }}>{totalMissingAddresses}</strong> salon
              {totalMissingAddresses > 1 ? 's' : ''} sans adresse,
              répartis sur {zonesWithMissingAddresses.length} zone
              {zonesWithMissingAddresses.length > 1 ? 's' : ''}.
            </div>
            <button
              onClick={runEnrichAllMissingAddresses}
              disabled={pending}
              style={{
                padding: '8px 14px',
                background: 'var(--warning-bg)', color: 'var(--warning)',
                border: '1px solid var(--warning)', borderRadius: 'var(--radius-sm)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              📍 Enrichir les adresses manquantes ({totalMissingAddresses})
            </button>
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
        <CityOverview cityStats={cityStats} onBulk={runBulkForCity} pending={pending} />
      )}

      {tab === 'map' && (
        <SalonsMap variant="admin" salons={mapSalons} zones={mapZones} />
      )}

      {tab === 'zones' && (
        <ZonesTable
          zones={zones}
          claimByZone={claimByZone}
          salonsByZone={salons.reduce<Record<string, number>>((acc, s) => {
            if (s.zoneId) acc[s.zoneId] = (acc[s.zoneId] ?? 0) + 1;
            return acc;
          }, {})}
          missingAddressByZone={salons.reduce<Record<string, number>>((acc, s) => {
            if (s.zoneId && !s.address) acc[s.zoneId] = (acc[s.zoneId] ?? 0) + 1;
            return acc;
          }, {})}
          unenrichedGoogleByZone={salons.reduce<Record<string, number>>((acc, s) => {
            if (s.zoneId && !s.googleEnriched) acc[s.zoneId] = (acc[s.zoneId] ?? 0) + 1;
            return acc;
          }, {})}
          onImportSalons={runImportSalons}
          onEnrichAddresses={runEnrichAddresses}
          onEnrichGoogle={runEnrichGoogle}
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

function CityOverview({
  cityStats, onBulk, pending,
}: { cityStats: CityStats[]; onBulk: (city: string, kind: 'salons' | 'google' | 'addresses') => void; pending: boolean }) {
  if (cityStats.length === 0) {
    return (
      <Empty>Aucune ville importée. Démarre avec le formulaire ci-dessus.</Empty>
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
            <Row label="Salons" value={c.salonsTotal} />
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
                  onClick={() => onBulk(c.city, 'salons')}
                  disabled={pending}
                  style={cityBulkPrimaryStyle}
                >🔄 {hasSalons ? 'Ré-importer' : 'Importer'} les salons OSM</button>
                <button
                  onClick={() => onBulk(c.city, 'google')}
                  disabled={pending || !hasSalons}
                  style={cityBulkGhostStyle(!hasSalons)}
                  title={!hasSalons ? 'Importe d\'abord les salons' : ''}
                >⚙ Enrichir Google (horaires, fermés, note)</button>
                <button
                  onClick={() => onBulk(c.city, 'addresses')}
                  disabled={pending || !hasSalons}
                  style={cityBulkGhostStyle(!hasSalons)}
                  title={!hasSalons ? 'Importe d\'abord les salons' : ''}
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

function ZonesTable({
  zones, claimByZone, salonsByZone, missingAddressByZone, unenrichedGoogleByZone,
  onImportSalons, onEnrichAddresses, onEnrichGoogle, onToggleActive, onReleaseClaim, pending,
}: {
  zones: Zone[];
  claimByZone: Map<string, Claim>;
  salonsByZone: Record<string, number>;
  missingAddressByZone: Record<string, number>;
  unenrichedGoogleByZone: Record<string, number>;
  onImportSalons: (zoneId: string) => void;
  onEnrichAddresses: (zoneId: string, force?: boolean) => void;
  onEnrichGoogle: (zoneId: string, force?: boolean) => void;
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
          const claim = claimByZone.get(z.id);
          const count = salonsByZone[z.id] ?? 0;
          const missing = missingAddressByZone[z.id] ?? 0;
          const unenrichedGoogle = unenrichedGoogleByZone[z.id] ?? 0;
          return (
            <div key={z.id} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius)',
              padding: 14,
              opacity: z.isActive ? 1 : 0.55,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {z.city}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 2, wordBreak: 'break-word' }}>
                    {z.name}
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)' }}>
                  <input
                    type="checkbox"
                    checked={z.isActive}
                    onChange={(e) => onToggleActive(z.id, e.target.checked)}
                    disabled={pending}
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
                {claim ? (
                  <span style={{ color: 'var(--accent)', fontSize: 11 }}>
                    🔒 {claim.ambassadorName} ({fmtDateShort(claim.claimedAt)})
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-3)', fontSize: 11 }}>libre</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  onClick={() => onImportSalons(z.id)}
                  disabled={pending}
                  style={{
                    flex: 1, minWidth: 0,
                    padding: '8px 12px',
                    background: 'var(--accent)', color: '#fff',
                    border: 'none', borderRadius: 'var(--radius-sm)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {count > 0 ? 'Réimporter salons' : 'Importer salons'}
                </button>
                {count > 0 && (
                  <button
                    onClick={() => onEnrichAddresses(z.id, missing === 0)}
                    disabled={pending}
                    title={missing > 0 ? `${missing} salon(s) sans adresse` : 'Toutes les adresses sont remplies — relance pour rafraîchir'}
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
                    📍 {missing > 0 ? `Adresses (${missing})` : 'Rafraîchir adresses'}
                  </button>
                )}
                {count > 0 && (
                  <button
                    onClick={() => onEnrichGoogle(z.id, unenrichedGoogle === 0)}
                    disabled={pending}
                    title={unenrichedGoogle > 0
                      ? `${unenrichedGoogle} salon(s) à enrichir via Google`
                      : 'Tous les salons sont déjà enrichis — relance pour rafraîchir horaires & note'}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--surface-2)', color: 'var(--text-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ⚙ {unenrichedGoogle > 0 ? `Google (${unenrichedGoogle})` : 'Rafraîchir Google'}
                  </button>
                )}
                {claim && (
                  <button onClick={() => onReleaseClaim(z.id)} disabled={pending} style={miniDangerBtnStyle}>
                    Libérer
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
      <div style={{ maxHeight: 600, overflowY: 'auto', overflowX: 'auto' }}>
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
      <div style={{ maxHeight: 600, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)' }}>
            <tr><Th>Date</Th><Th>Ville</Th><Th>Salon</Th><Th>Ambassadeur</Th><Th>GPS</Th><Th>Flyer</Th><Th>Convaincu</Th><Th>Note</Th><Th>Relance</Th><Th>Notes</Th></tr>
          </thead>
          <tbody>
            {visits.map((v) => (
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
        title: distanceM != null ? `Visite à ${distanceM} m du salon` : 'Visite vérifiée par GPS',
      }
    : distanceM != null
      ? {
          bg: 'var(--warning-bg)', fg: 'var(--warning)', bd: 'var(--warning)',
          label: `⚠ ${distanceM} m`,
          title: `Visite enregistrée à ${distanceM} m du salon — hors du rayon de vérification`,
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
const miniDangerBtnStyle: React.CSSProperties = {
  ...miniBtnStyle, color: 'var(--error)', borderColor: 'var(--error)',
};
