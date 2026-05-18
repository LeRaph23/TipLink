'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { isOpenNow, mapsLink as buildMapsLink } from '@/lib/salon-hours';
import { CategoryIcon, type AmbassadorSalon } from '@/components/salons/SalonsMap';

const SalonsMap = dynamic(
  () => import('@/components/salons/SalonsMap').then((m) => m.SalonsMap),
  { ssr: false, loading: () => (
    <div style={{ height: '60vh', minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13, background: 'var(--surface-2)', borderRadius: 'var(--radius)' }}>
      Chargement de la carte…
    </div>
  ) }
);

const ZonesMap = dynamic(
  () => import('@/components/salons/ZonesMap').then((m) => m.ZonesMap),
  { ssr: false, loading: () => (
    <div style={{ height: '60vh', minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13, background: 'var(--surface-2)', borderRadius: 'var(--radius)' }}>
      Chargement de la carte…
    </div>
  ) }
);

type Bbox = { minLat: number; minLon: number; maxLat: number; maxLon: number };
type ZoneSummary = {
  id: string;
  city: string;
  name: string;
  salonCount: number;
  todoCount: number;
  bbox: Bbox | null;
};

type Salon = AmbassadorSalon & { website: string | null };

type GeoFix = { lat: number; lon: number; accuracy: number };
type GeoStatus = 'locating' | 'ok' | 'denied' | 'unavailable';

const RATING_LABEL: Record<number, string> = {
  1: 'Peu probable',
  2: 'Possible',
  3: 'Très probable',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const mapsLink = buildMapsLink;

// Map/list preference persisted per screen (hydration-safe localStorage read).
function usePersistedView(key: string): ['map' | 'list', (v: 'map' | 'list') => void] {
  const [view, setView] = useState<'map' | 'list'>('map');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(key);
    if (saved === 'list' || saved === 'map') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView(saved);
    }
  }, [key]);
  const change = useCallback((v: 'map' | 'list') => {
    setView(v);
    if (typeof window !== 'undefined') window.localStorage.setItem(key, v);
  }, [key]);
  return [view, change];
}

export function AmbassadeurSalonsTracker({ code }: { code: string }) {
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState<ZoneSummary[]>([]);
  const [zoneCity, setZoneCity] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<ZoneSummary | null>(null);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [salonsLoading, setSalonsLoading] = useState(false);
  const [zoneBbox, setZoneBbox] = useState<Bbox | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeVisitFor, setActiveVisitFor] = useState<Salon | null>(null);
  const [view, onChangeView] = usePersistedView('tiplink:salons-view');
  const [zonesView, onChangeZonesView] = usePersistedView('tiplink:zones-view');

  const refreshZones = useCallback(async () => {
    try {
      const res = await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/zones`);
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? 'Erreur');
        return;
      }
      setActionError(null);
      setZones(data.zones ?? []);
      setZoneCity(data.city ?? null);
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => { void refreshZones(); }, [refreshZones]);

  const loadSalons = useCallback(async (zoneId: string) => {
    setSalonsLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/salons?zoneId=${encodeURIComponent(zoneId)}`);
      const data = await res.json();
      if (res.ok) {
        setSalons(data.salons ?? []);
        setZoneBbox(data.zone?.bbox ?? null);
      } else {
        setActionError(data.error ?? 'Erreur');
      }
    } finally {
      setSalonsLoading(false);
    }
  }, [code]);

  const openZone = useCallback(async (zone: ZoneSummary) => {
    setSelectedZone(zone);
    setSalons([]);
    setZoneBbox(null);
    await loadSalons(zone.id);
  }, [loadSalons]);

  const backToZones = useCallback(async () => {
    setSelectedZone(null);
    setSalons([]);
    setZoneBbox(null);
    setLoading(true);
    await refreshZones();
  }, [refreshZones]);

  if (loading) {
    return (
      <SectionShell title="Zones à démarcher">
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          Chargement…
        </div>
      </SectionShell>
    );
  }

  // ── Zone overview ───────────────────────────────────────────────────────────
  if (!selectedZone) {
    const bboxZones = zones.filter((z): z is ZoneSummary & { bbox: Bbox } => z.bbox != null);
    const hiddenCount = zones.length - bboxZones.length;

    return (
      <SectionShell title="Zones à démarcher">
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
            Choisis une <strong>zone</strong> pour voir ses établissements{zoneCity ? <> à <strong>{zoneCity}</strong></> : null}.
            La pastille indique le nombre d’établissements à démarcher.
          </div>
          {actionError && (
            <div style={{
              background: 'var(--error-bg)', color: 'var(--error)',
              borderRadius: 'var(--radius-sm)', padding: '8px 12px',
              fontSize: 12, marginBottom: 10,
            }}>{actionError}</div>
          )}
        </div>

        {zones.length === 0 ? (
          <div style={{ padding: '4px 16px 20px', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
            Aucune zone disponible pour le moment. Reviens plus tard.
          </div>
        ) : (
          <>
            <ViewToggle view={zonesView} onChange={onChangeZonesView} />

            {zonesView === 'map' && bboxZones.length > 0 ? (
              <div style={{ padding: 12 }}>
                <ZonesMap zones={bboxZones} onSelect={(z) => { void openZone(z); }} />
                {hiddenCount > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
                    {hiddenCount} zone{hiddenCount > 1 ? 's' : ''} sans localisation — en vue Liste.
                  </div>
                )}
              </div>
            ) : zonesView === 'map' ? (
              <div style={{ padding: '4px 16px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '10px 0 14px' }}>
                  Aucune zone géolocalisée — voici la liste.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {zones.map((z) => (
                    <ZoneCard key={z.id} zone={z} onOpen={() => openZone(z)} />
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {zones.map((z) => (
                  <ZoneCard key={z.id} zone={z} onOpen={() => openZone(z)} />
                ))}
              </div>
            )}
          </>
        )}
      </SectionShell>
    );
  }

  // ── Salons of the selected zone ─────────────────────────────────────────────
  const notVisited = salons.filter((s) => !s.visit);
  const visitedByOthers = salons.filter((s) => s.visit && !s.visit.visitedByMe);
  const visitedByMe = salons.filter((s) => s.visit?.visitedByMe);

  return (
    <SectionShell
      title="Établissements à démarcher"
      right={
        <button
          onClick={backToZones}
          style={{
            fontSize: 11, padding: '4px 10px',
            background: 'transparent', color: 'var(--text-3)',
            border: '1px solid var(--border)', borderRadius: 99, cursor: 'pointer',
          }}
        >
          ← Zones
        </button>
      }
    >
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Zone
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', marginTop: 2 }}>
          {selectedZone.name}
          <span style={{ color: 'var(--text-3)', fontSize: 12, marginLeft: 6, fontWeight: 500 }}>
            · {selectedZone.city}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
          <span>📍 {salons.length} établissements</span>
          <span>✓ {visitedByMe.length} faits par toi</span>
          <span>🚫 {visitedByOthers.length} déjà faits</span>
        </div>
      </div>

      {actionError && (
        <div style={{
          margin: 12, background: 'var(--error-bg)', color: 'var(--error)',
          borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 12,
        }}>{actionError}</div>
      )}

      {salonsLoading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          Chargement…
        </div>
      ) : salons.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
          Aucun établissement dans cette zone pour le moment. Préviens l&apos;admin.
        </div>
      ) : (
        <>
          <ViewToggle view={view} onChange={onChangeView} />

          {view === 'map' ? (
            <div style={{ padding: 12 }}>
              <SalonsMap
                variant="ambassador"
                salons={salons}
                initialBbox={zoneBbox}
                onLogVisit={(s) => setActiveVisitFor(s as Salon)}
              />
            </div>
          ) : (
            <>
              {notVisited.length > 0 && (
                <SubHeading>À faire ({notVisited.length})</SubHeading>
              )}
              {notVisited.map((s) => (
                <SalonRow key={s.id} salon={s} onLogVisit={() => setActiveVisitFor(s)} />
              ))}

              {visitedByMe.length > 0 && <SubHeading>Tes visites ({visitedByMe.length})</SubHeading>}
              {visitedByMe.map((s) => (
                <SalonRow key={s.id} salon={s} onLogVisit={() => setActiveVisitFor(s)} />
              ))}

              {visitedByOthers.length > 0 && (
                <SubHeading>Déjà visités par un autre ambassadeur ({visitedByOthers.length})</SubHeading>
              )}
              {visitedByOthers.map((s) => (
                <SalonRow key={s.id} salon={s} onLogVisit={null} dimmed />
              ))}
            </>
          )}
        </>
      )}

      {activeVisitFor && (
        <VisitModal
          code={code}
          salon={activeVisitFor}
          onClose={() => setActiveVisitFor(null)}
          onSaved={async () => {
            setActiveVisitFor(null);
            await loadSalons(selectedZone.id);
          }}
        />
      )}
    </SectionShell>
  );
}

function ViewToggle({ view, onChange }: { view: 'map' | 'list'; onChange: (v: 'map' | 'list') => void }) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'center', gap: 4 }}>
      {(['map', 'list'] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          style={{
            padding: '6px 14px', borderRadius: 99,
            background: view === v ? 'var(--accent-muted)' : 'transparent',
            color: view === v ? 'var(--accent)' : 'var(--text-3)',
            border: `1px solid ${view === v ? 'var(--accent-border)' : 'var(--border)'}`,
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {v === 'map' ? '🗺️ Carte' : '📋 Liste'}
        </button>
      ))}
    </div>
  );
}

function ZoneCard({ zone, onOpen }: { zone: ZoneSummary; onOpen: () => void }) {
  const done = Math.max(0, zone.salonCount - zone.todoCount);
  const pct = zone.salonCount > 0 ? (done / zone.salonCount) * 100 : 0;
  const allDone = zone.salonCount > 0 && zone.todoCount === 0;

  return (
    <button
      onClick={onOpen}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '12px 14px', background: 'var(--surface-2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
          {zone.name}
          <span style={{ color: 'var(--text-3)', fontWeight: 500, fontSize: 11, marginLeft: 6 }}>
            · {zone.city}
          </span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          Voir →
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 11, color: 'var(--text-3)' }}>
        <span>📍 {zone.salonCount} établissement{zone.salonCount !== 1 ? 's' : ''}</span>
        {zone.salonCount === 0 ? (
          <span>Aucun établissement</span>
        ) : allDone ? (
          <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Tout démarché</span>
        ) : (
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
            {zone.todoCount} à démarcher
          </span>
        )}
      </div>
      <div style={{ marginTop: 8, height: 6, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: allDone ? 'var(--success)' : 'var(--accent)',
          borderRadius: 99,
        }} />
      </div>
    </button>
  );
}

function SectionShell({
  title, right, children,
}: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      marginBottom: 16,
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '10px 16px 6px',
      fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
      textTransform: 'uppercase', letterSpacing: '0.07em',
      background: 'var(--surface-2)',
      borderTop: '1px solid var(--border-subtle)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>{children}</div>
  );
}

function SalonRow({
  salon, onLogVisit, dimmed,
}: { salon: Salon; onLogVisit: (() => void) | null; dimmed?: boolean }) {
  const v = salon.visit;
  const openState = isOpenNow(salon.opening_hours);
  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: '1px solid var(--border-subtle)',
      opacity: dimmed ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <CategoryIcon category={salon.category} size={14} color="var(--text-3)" strokeWidth={2.2} />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{salon.name}</span>
            </span>
            {salon.converted && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                background: 'rgba(37,99,235,0.12)', color: '#2563eb',
                border: '1px solid #2563eb', whiteSpace: 'nowrap',
              }}>
                🔵 Client
              </span>
            )}
            {openState && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                background: openState.open ? 'var(--success-bg)' : 'var(--error-bg)',
                color: openState.open ? 'var(--success)' : 'var(--error)',
                border: `1px solid ${openState.open ? 'var(--success)' : 'var(--error)'}`,
                whiteSpace: 'nowrap',
              }}>
                {openState.open ? '● Ouvert' : '○ Fermé'}
              </span>
            )}
            {salon.google_rating != null && (
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                ⭐ {salon.google_rating.toFixed(1)}
              </span>
            )}
          </div>
          {openState?.nextChange && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
              {openState.nextChange}
            </div>
          )}
          {salon.address && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              {salon.address}{salon.postal_code ? ` · ${salon.postal_code}` : ''}
            </div>
          )}
          {v && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, fontSize: 10,
            }}>
              <Pill>{fmtDate(v.lastVisitAt)}</Pill>
              <Pill color={v.bestRating === 3 ? 'success' : v.bestRating === 2 ? 'warning' : 'neutral'}>
                ⭐ {v.bestRating}/3 · {RATING_LABEL[v.bestRating]}
              </Pill>
              {v.flyerLeft && <Pill>🪧 Flyer</Pill>}
              {v.bestConvinced === 'yes' && <Pill color="success">✓ Convaincu</Pill>}
              {v.bestConvinced === 'maybe' && <Pill color="warning">~ Peut-être</Pill>}
            </div>
          )}
          {v?.myNotes && (
            <div style={{
              marginTop: 6, fontSize: 11, color: 'var(--text-2)',
              fontStyle: 'italic',
            }}>« {v.myNotes} »</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          {(salon.lat != null || salon.address) && (
            <a
              href={mapsLink(salon)} target="_blank" rel="noopener noreferrer"
              style={{
                fontSize: 10, padding: '3px 8px',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 99, color: 'var(--text-2)', textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >📍 Maps</a>
          )}
          {salon.phone && (
            <a
              href={`tel:${salon.phone}`}
              style={{
                fontSize: 10, padding: '3px 8px',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 99, color: 'var(--text-2)', textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >☎ Appeler</a>
          )}
          {onLogVisit && (
            <button
              onClick={onLogVisit}
              style={{
                fontSize: 11, padding: '5px 12px',
                background: 'var(--accent)', color: '#fff',
                border: 'none', borderRadius: 99, cursor: 'pointer',
                fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              {v?.visitedByMe ? 'Re-visiter' : 'Visiter'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color?: 'success' | 'warning' | 'neutral' }) {
  const styles =
    color === 'success'
      ? { bg: 'var(--success-bg)', fg: 'var(--success)', bd: 'var(--success)' }
    : color === 'warning'
      ? { bg: 'var(--warning-bg)', fg: 'var(--warning)', bd: 'var(--warning)' }
      : { bg: 'var(--surface-2)', fg: 'var(--text-3)', bd: 'var(--border)' };
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 99,
      background: styles.bg, color: styles.fg,
      border: `1px solid ${styles.bd}`, fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function VisitModal({
  code, salon, onClose, onSaved,
}: {
  code: string;
  salon: Salon;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [flyerLeft, setFlyerLeft] = useState(false);
  const [convinced, setConvinced] = useState<'yes' | 'maybe' | 'no'>('no');
  const [rating, setRating] = useState<number>(2);
  const [notes, setNotes] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [isClient, setIsClient] = useState(salon.converted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoFix | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('locating');

  // GPS check-in: capture the device position as soon as the modal opens, so a
  // fix is ready by the time the ambassador submits.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGeoStatus('unavailable');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGeoStatus('ok');
      },
      () => setGeoStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, []);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salonId: salon.id, flyerLeft, convinced,
          likelihoodRating: rating,
          notes: notes.trim() || undefined,
          followUpAt: followUpAt || undefined,
          gps: geo ?? undefined,
          converted: isClient,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Erreur');
        return;
      }
      onSaved();
    } finally { setSaving(false); }
  };

  const geoStyle =
    geoStatus === 'ok'
      ? { bg: 'var(--success-bg)', fg: 'var(--success)', bd: 'var(--success)', icon: '📍' }
    : geoStatus === 'locating'
      ? { bg: 'var(--surface-2)', fg: 'var(--text-3)', bd: 'var(--border)', icon: '⏳' }
      : { bg: 'var(--warning-bg)', fg: 'var(--warning)', bd: 'var(--warning)', icon: '⚠️' };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)', zIndex: 100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)', width: '100%', maxWidth: 480,
          borderTopLeftRadius: 'var(--radius-xl)', borderTopRightRadius: 'var(--radius-xl)',
          padding: '20px 18px 24px', maxHeight: '92dvh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 99, margin: '0 auto 14px' }} />
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>
          {salon.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
          {salon.address ?? 'Enregistrer ta visite'}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 'var(--radius-sm)', marginBottom: 16,
          fontSize: 11.5, fontWeight: 500, lineHeight: 1.4,
          background: geoStyle.bg, color: geoStyle.fg,
          border: `1px solid ${geoStyle.bd}`,
        }}>
          <span style={{ fontSize: 14 }}>{geoStyle.icon}</span>
          <span>
            {geoStatus === 'locating' && 'Localisation en cours… reste sur place.'}
            {geoStatus === 'ok' && geo &&
              `Position détectée (±${Math.round(geo.accuracy)} m) — ta visite sera vérifiée.`}
            {geoStatus === 'denied' &&
              'Localisation refusée — la visite sera enregistrée mais marquée non vérifiée.'}
            {geoStatus === 'unavailable' &&
              'Localisation indisponible sur cet appareil — visite marquée non vérifiée.'}
          </span>
        </div>

        <Field label="Tu as laissé un flyer ?">
          <div style={{ display: 'flex', gap: 8 }}>
            <Toggle active={!flyerLeft} onClick={() => setFlyerLeft(false)}>Non</Toggle>
            <Toggle active={flyerLeft} onClick={() => setFlyerLeft(true)}>Oui 🪧</Toggle>
          </div>
        </Field>

        <Field label="Convaincu·e de commander ?">
          <div style={{ display: 'flex', gap: 8 }}>
            <Toggle active={convinced === 'no'} onClick={() => setConvinced('no')}>Non</Toggle>
            <Toggle active={convinced === 'maybe'} onClick={() => setConvinced('maybe')}>Peut-être</Toggle>
            <Toggle active={convinced === 'yes'} onClick={() => setConvinced('yes')}>Oui</Toggle>
          </div>
        </Field>

        <Field label="Probabilité de commande">
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3].map((r) => (
              <Toggle key={r} active={rating === r} onClick={() => setRating(r)}>
                {'⭐'.repeat(r)} <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.8 }}>{RATING_LABEL[r]}</span>
              </Toggle>
            ))}
          </div>
        </Field>

        <Field label="Devenu client ? (l'établissement a commandé)">
          <div style={{ display: 'flex', gap: 8 }}>
            <Toggle active={!isClient} onClick={() => setIsClient(false)}>Non</Toggle>
            <Toggle active={isClient} onClick={() => setIsClient(true)}>Oui 🔵</Toggle>
          </div>
        </Field>

        <Field label="Notes (optionnel)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
            rows={3}
            placeholder="Ex: parler à Sophie, repasser jeudi…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 10px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)',
              fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
            }}
          />
        </Field>

        <Field label="Date de relance (optionnel)">
          <input
            type="date"
            value={followUpAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
            style={{
              padding: '8px 10px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)',
              fontSize: 13,
            }}
          />
        </Field>

        {error && (
          <div style={{
            background: 'var(--error-bg)', color: 'var(--error)',
            borderRadius: 'var(--radius-sm)', padding: '8px 12px',
            fontSize: 12, marginBottom: 12,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px',
              background: 'var(--surface-2)', color: 'var(--text-2)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >Annuler</button>
          <button
            onClick={save}
            disabled={saving}
            style={{
              flex: 2, padding: '12px',
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-sm)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >{saving ? 'Enregistrement…' : 'Enregistrer la visite'}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6,
      }}>{label}</div>
      {children}
    </div>
  );
}

function Toggle({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '9px 8px',
        background: active ? 'var(--accent-muted)' : 'var(--surface-2)',
        color: active ? 'var(--accent)' : 'var(--text-2)',
        border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600,
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >{children}</button>
  );
}
