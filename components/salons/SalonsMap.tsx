'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Rectangle, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './salons-map.css';
import { isOpenNow, mapsLink, type OpeningHours } from '@/lib/salon-hours';

// ─── Public types ────────────────────────────────────────────────────────────

export type AmbassadorSalon = {
  id: string;
  name: string;
  category: string;
  converted: boolean;
  address: string | null;
  postal_code: string | null;
  phone: string | null;
  lat: number | null;
  lon: number | null;
  opening_hours: OpeningHours;
  business_status: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | null;
  google_rating: number | null;
  visit: {
    lastVisitAt: string;
    bestRating: number;
    bestConvinced: 'yes' | 'maybe' | 'no';
    flyerLeft: boolean;
    visitedByMe: boolean;
    myNotes: string | null;
  } | null;
};

export type AdminSalon = {
  id: string;
  name: string;
  city: string;
  zoneId: string | null;
  zoneName: string | null;
  address: string | null;
  postal_code: string | null;
  phone: string | null;
  lat: number | null;
  lon: number | null;
  opening_hours: OpeningHours;
  business_status: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | null;
  google_rating: number | null;
  isActive: boolean;
  visits: Array<{
    id: string;
    ambassadorId: string;
    ambassadorName: string;
    visitedAt: string;
    likelihoodRating: number;
    convinced: 'yes' | 'maybe' | 'no';
    notes: string | null;
    locationVerified: boolean;
    distanceM: number | null;
  }>;
};

export type AdminZoneOverlay = {
  id: string;
  city: string;
  name: string;
  bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number } | null;
  claimedByAmbassadorId: string | null;
  claimedByAmbassadorName: string | null;
};

type CommonProps = {
  /** Initial bbox to fit. Optional; if absent, map fits markers. */
  initialBbox?: { minLat: number; minLon: number; maxLat: number; maxLon: number } | null;
};

type AmbassadorProps = CommonProps & {
  variant: 'ambassador';
  salons: AmbassadorSalon[];
  onLogVisit: (salon: AmbassadorSalon) => void;
};

type AdminProps = CommonProps & {
  variant: 'admin';
  salons: AdminSalon[];
  zones?: AdminZoneOverlay[];
};

export type SalonsMapProps = AmbassadorProps | AdminProps;

// ─── Tiles ───────────────────────────────────────────────────────────────────

const TILES_LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILES_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILES_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

function useMapTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    const html = document.documentElement;
    const apply = () => setTheme((html.dataset.theme as 'light' | 'dark') === 'dark' ? 'dark' : 'light');
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

// ─── Marker icons ────────────────────────────────────────────────────────────

function makeIcon(className: string, badge?: string): L.DivIcon {
  return L.divIcon({
    className: 'salon-marker-wrapper',
    html: `<div class="salon-marker ${className}">${badge ? `<span class="badge">${badge}</span>` : ''}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

// Establishment categories — icon says *what*, colour says *where we're at*.
export const CATEGORY_EMOJI: Record<string, string> = {
  coiffure: '✂️', esthetique: '💅', restaurant: '🍽️', cafe: '☕', bar: '🍸',
};
export const CATEGORY_LABEL: Record<string, string> = {
  coiffure: 'Coiffure', esthetique: 'Esthétique', restaurant: 'Restaurant', cafe: 'Café', bar: 'Bar',
};

// Status colour: converted (client) > closed > visited > to-canvass.
function salonStatusColor(s: AmbassadorSalon): string {
  if (s.converted) return '#2563eb';                               // bleu — client
  if (s.business_status === 'CLOSED_PERMANENTLY') return '#94a3b8'; // gris — fermé
  if (s.visit) return '#f59e0b';                                   // ambre — démarché, en attente
  return '#16a34a';                                                // vert — à démarcher
}

function ambassadorIcon(s: AmbassadorSalon): L.DivIcon {
  const color = salonStatusColor(s);
  const emoji = CATEGORY_EMOJI[s.category] ?? '📍';
  return L.divIcon({
    className: 'salon-marker-wrapper',
    html: `<div class="salon-marker-cat" style="background:${color}">${emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

function adminIcon(s: AdminSalon): L.DivIcon {
  if (!s.isActive || s.business_status === 'CLOSED_PERMANENTLY') return makeIcon('closed', '✕');
  const best = s.visits.reduce((m, v) => Math.max(m, v.likelihoodRating), 0);
  if (best === 3) return makeIcon('r3', '★');
  if (best === 2) return makeIcon('r2');
  if (best === 1) return makeIcon('r1');
  return makeIcon('unvisited');
}

// Coloured cluster bubbles
type ClusterLike = { getChildCount: () => number };
function clusterIcon(cluster: ClusterLike): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 36 : count < 100 ? 44 : 52;
  return L.divIcon({
    html: `<div class="salon-cluster" style="width:${size}px;height:${size}px;">${count}</div>`,
    className: '',
    iconSize: [size, size],
  });
}

// ─── Helpers for fitting/locating ────────────────────────────────────────────

function FitToBbox({ bbox }: { bbox: CommonProps['initialBbox'] }) {
  const map = useMap();
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current || !bbox) return;
    map.fitBounds(
      [
        [bbox.minLat, bbox.minLon],
        [bbox.maxLat, bbox.maxLon],
      ],
      { padding: [24, 24], maxZoom: 16 }
    );
    fittedRef.current = true;
  }, [bbox, map]);
  return null;
}

function LocateButton() {
  const map = useMap();
  const onClick = () => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => map.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { duration: 0.8 }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };
  return (
    <button className="salon-map-locate" onClick={onClick} title="Me localiser" aria-label="Me localiser">
      📍
    </button>
  );
}

// ─── Filter chip primitive ───────────────────────────────────────────────────

function Chip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`salon-map-chip${active ? ' active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

// ─── Ambassador variant filter state ─────────────────────────────────────────

type AmbStatus = 'all' | 'todo' | 'mine' | 'others';
type RatingMin = 0 | 3 | 4;

function useAmbassadorFilters(all: AmbassadorSalon[]) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AmbStatus>('all');
  const [openNow, setOpenNow] = useState(false);
  const [minRating, setMinRating] = useState<RatingMin>(0);
  const [showClosed, setShowClosed] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((s) => {
      if (s.lat == null || s.lon == null) return false;
      if (!showClosed && s.business_status === 'CLOSED_PERMANENTLY') return false;
      if (q && !s.name.toLowerCase().includes(q) && !(s.address ?? '').toLowerCase().includes(q)) return false;
      if (minRating && (s.google_rating ?? 0) < minRating) return false;
      if (openNow) {
        const o = isOpenNow(s.opening_hours);
        if (!o?.open) return false;
      }
      switch (status) {
        case 'todo':   return !s.visit;
        case 'mine':   return s.visit?.visitedByMe === true;
        case 'others': return s.visit != null && !s.visit.visitedByMe;
        default:       return true;
      }
    });
  }, [all, search, status, openNow, minRating, showClosed]);

  return { filtered, state: { search, status, openNow, minRating, showClosed }, setters: { setSearch, setStatus, setOpenNow, setMinRating, setShowClosed } };
}

// ─── Admin variant filter state ──────────────────────────────────────────────

type AdminStatus = 'all' | 'never' | 'r1' | 'r2' | 'r3';

function useAdminFilters(all: AdminSalon[]) {
  const [search, setSearch] = useState('');
  const [city, setCity] = useState<string>('all');
  const [zoneId, setZoneId] = useState<string>('all');
  const [ambassadorId, setAmbassadorId] = useState<string>('all');
  const [status, setStatus] = useState<AdminStatus>('all');
  const [openNow, setOpenNow] = useState(false);
  const [minRating, setMinRating] = useState<RatingMin>(0);
  const [showClosed, setShowClosed] = useState(false);
  const [showBboxes, setShowBboxes] = useState(false);

  const cities = useMemo(() => Array.from(new Set(all.map((s) => s.city))).sort(), [all]);
  const zones = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of all) {
      if (s.zoneId && s.zoneName && (city === 'all' || s.city === city)) {
        m.set(s.zoneId, `${s.city} · ${s.zoneName}`);
      }
    }
    return Array.from(m, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [all, city]);
  const ambassadors = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of all) for (const v of s.visits) m.set(v.ambassadorId, v.ambassadorName);
    return Array.from(m, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((s) => {
      if (s.lat == null || s.lon == null) return false;
      const closed = !s.isActive || s.business_status === 'CLOSED_PERMANENTLY';
      if (!showClosed && closed) return false;
      if (city !== 'all' && s.city !== city) return false;
      if (zoneId !== 'all' && s.zoneId !== zoneId) return false;
      if (ambassadorId !== 'all' && !s.visits.some((v) => v.ambassadorId === ambassadorId)) return false;
      if (q && !s.name.toLowerCase().includes(q) && !(s.address ?? '').toLowerCase().includes(q)) return false;
      if (minRating && (s.google_rating ?? 0) < minRating) return false;
      if (openNow) {
        const o = isOpenNow(s.opening_hours);
        if (!o?.open) return false;
      }
      const best = s.visits.reduce((m, v) => Math.max(m, v.likelihoodRating), 0);
      switch (status) {
        case 'never': return s.visits.length === 0;
        case 'r1':    return best === 1;
        case 'r2':    return best === 2;
        case 'r3':    return best === 3;
        default:      return true;
      }
    });
  }, [all, search, city, zoneId, ambassadorId, status, openNow, minRating, showClosed]);

  return {
    filtered,
    cities, zones, ambassadors,
    state: { search, city, zoneId, ambassadorId, status, openNow, minRating, showClosed, showBboxes },
    setters: { setSearch, setCity, setZoneId, setAmbassadorId, setStatus, setOpenNow, setMinRating, setShowClosed, setShowBboxes },
  };
}

// ─── Popup bodies ────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function AmbassadorPopup({ salon, onLogVisit }: { salon: AmbassadorSalon; onLogVisit: (s: AmbassadorSalon) => void }) {
  const open = isOpenNow(salon.opening_hours);
  const v = salon.visit;
  return (
    <div className="salon-popup">
      <div className="salon-popup__title">{salon.name}</div>
      <div className="salon-popup__row">
        <span className="salon-popup__pill rate">
          {CATEGORY_EMOJI[salon.category] ?? '📍'} {CATEGORY_LABEL[salon.category] ?? 'Établissement'}
        </span>
        {salon.converted && (
          <span
            className="salon-popup__pill"
            style={{ background: 'rgba(37,99,235,0.12)', color: '#2563eb', border: '1px solid #2563eb' }}
          >
            🔵 Client
          </span>
        )}
        {open && (
          <span className={`salon-popup__pill ${open.open ? 'open' : 'shut'}`}>
            {open.open ? '● Ouvert' : '○ Fermé'}{open.nextChange ? ` · ${open.nextChange}` : ''}
          </span>
        )}
        {salon.google_rating != null && (
          <span className="salon-popup__pill rate">⭐ {salon.google_rating.toFixed(1)}</span>
        )}
      </div>
      {salon.address && (
        <div className="salon-popup__addr">
          {salon.address}{salon.postal_code ? ` · ${salon.postal_code}` : ''}
        </div>
      )}
      {v && (
        <div className="salon-popup__visit">
          {v.visitedByMe ? 'Visité par toi' : 'Visité par un autre'} · {fmtDate(v.lastVisitAt)} · ⭐ {v.bestRating}/3
          {v.flyerLeft ? ' · 🪧 flyer' : ''}
        </div>
      )}
      <div className="salon-popup__actions">
        <a href={mapsLink(salon)} target="_blank" rel="noopener noreferrer" className="salon-popup__btn ghost">
          📍 Itinéraire
        </a>
        {salon.phone && (
          <a href={`tel:${salon.phone}`} className="salon-popup__btn ghost">☎ Appeler</a>
        )}
        <button onClick={() => onLogVisit(salon)} className="salon-popup__btn primary">
          {v?.visitedByMe ? 'Re-visiter' : 'Visiter'}
        </button>
      </div>
    </div>
  );
}

function AdminPopup({ salon }: { salon: AdminSalon }) {
  const open = isOpenNow(salon.opening_hours);
  return (
    <div className="salon-popup">
      <div className="salon-popup__title">{salon.name}</div>
      <div className="salon-popup__row">
        <span className="salon-popup__pill rate">{salon.city}{salon.zoneName ? ` · ${salon.zoneName}` : ''}</span>
        {open && (
          <span className={`salon-popup__pill ${open.open ? 'open' : 'shut'}`}>
            {open.open ? '● Ouvert' : '○ Fermé'}
          </span>
        )}
        {salon.google_rating != null && (
          <span className="salon-popup__pill rate">⭐ {salon.google_rating.toFixed(1)}</span>
        )}
      </div>
      {salon.address && (
        <div className="salon-popup__addr">
          {salon.address}{salon.postal_code ? ` · ${salon.postal_code}` : ''}
        </div>
      )}
      {salon.visits.length > 0 ? (
        <div className="salon-popup__visit">
          {salon.visits.length} visite{salon.visits.length > 1 ? 's' : ''} ·{' '}
          dernière {fmtDate(salon.visits[0].visitedAt)} par {salon.visits[0].ambassadorName}
          <div style={{ marginTop: 4, color: 'var(--text-3)', fontSize: 10 }}>
            Meilleure note : ⭐ {salon.visits.reduce((m, v) => Math.max(m, v.likelihoodRating), 0)}/3
          </div>
          <div style={{ marginTop: 4 }}>
            {salon.visits[0].locationVerified ? (
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--success)' }}>
                📍 Dernière visite vérifiée
                {salon.visits[0].distanceM != null ? ` (${salon.visits[0].distanceM} m)` : ''}
              </span>
            ) : salon.visits[0].distanceM != null ? (
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--warning)' }}>
                ⚠ Dernière visite à {salon.visits[0].distanceM} m — non vérifiée
              </span>
            ) : (
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>
                — Dernière visite sans GPS
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="salon-popup__visit" style={{ color: 'var(--text-3)' }}>
          Jamais visité
        </div>
      )}
      <div className="salon-popup__actions">
        <a href={mapsLink(salon)} target="_blank" rel="noopener noreferrer" className="salon-popup__btn ghost">
          📍 Maps
        </a>
        {salon.phone && (
          <a href={`tel:${salon.phone}`} className="salon-popup__btn ghost">☎</a>
        )}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

const PARIS: [number, number] = [46.7, 2.3]; // Centre France fallback

export function SalonsMap(props: SalonsMapProps) {
  const theme = useMapTheme();

  if (props.variant === 'ambassador') return <AmbassadorMap {...props} theme={theme} />;
  return <AdminMap {...props} theme={theme} />;
}

function AmbassadorMap({
  salons, onLogVisit, initialBbox, theme,
}: AmbassadorProps & { theme: 'light' | 'dark' }) {
  const { filtered, state, setters } = useAmbassadorFilters(salons);

  return (
    <div>
      <div className="salon-map-filters">
        <input
          className="salon-map-search"
          placeholder="🔍 Rechercher…"
          value={state.search}
          onChange={(e) => setters.setSearch(e.target.value)}
        />
        <Chip active={state.status === 'all'}    onClick={() => setters.setStatus('all')}>Tous</Chip>
        <Chip active={state.status === 'todo'}   onClick={() => setters.setStatus('todo')}>À faire</Chip>
        <Chip active={state.status === 'mine'}   onClick={() => setters.setStatus('mine')}>Mes visites</Chip>
        <Chip active={state.status === 'others'} onClick={() => setters.setStatus('others')}>Faits</Chip>
        <Chip active={state.openNow}             onClick={() => setters.setOpenNow(!state.openNow)}>🕐 Ouvert</Chip>
        <Chip active={state.minRating === 4}     onClick={() => setters.setMinRating(state.minRating === 4 ? 0 : 4)}>⭐4+</Chip>
        <Chip active={state.minRating === 3}     onClick={() => setters.setMinRating(state.minRating === 3 ? 0 : 3)}>⭐3+</Chip>
        <Chip active={state.showClosed}          onClick={() => setters.setShowClosed(!state.showClosed)}>☠ Fermés</Chip>
      </div>

      <div className="salon-map-wrap">
        <MapContainer
          center={initialBbox
            ? [(initialBbox.minLat + initialBbox.maxLat) / 2, (initialBbox.minLon + initialBbox.maxLon) / 2]
            : PARIS}
          zoom={13}
          scrollWheelZoom
        >
          <TileLayer url={theme === 'dark' ? TILES_DARK : TILES_LIGHT} attribution={TILES_ATTRIB} />
          <FitToBbox bbox={initialBbox ?? null} />
          <LocateButton />
          <MarkerClusterGroup chunkedLoading iconCreateFunction={clusterIcon}>
            {filtered.map((s) => (
              <Marker key={s.id} position={[s.lat as number, s.lon as number]} icon={ambassadorIcon(s)}>
                <Popup>
                  <AmbassadorPopup salon={s} onLogVisit={onLogVisit} />
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>
      <div className="salon-map-counter">
        {filtered.length} établissement{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''} / {salons.length}
      </div>
      <div style={{ margin: '8px 2px 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.7 }}>
        <div>✂️ Coiffure · 💅 Esthétique · 🍽️ Resto · ☕ Café · 🍸 Bar</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 2 }}>
          {([['#16a34a', 'À démarcher'], ['#f59e0b', 'En attente'], ['#2563eb', 'Client'], ['#94a3b8', 'Fermé']] as const).map(
            ([c, label]) => (
              <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: c, display: 'inline-block' }} />
                {label}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function AdminMap({
  salons, zones, initialBbox, theme,
}: AdminProps & { theme: 'light' | 'dark' }) {
  const f = useAdminFilters(salons);

  // For bbox overlay: derive a deterministic colour per ambassador
  const ambColor = useMemo(() => {
    const palette = ['#E57A97', '#2563eb', '#16a34a', '#f59e0b', '#a855f7', '#06b6d4', '#ef4444', '#84cc16'];
    const m = new Map<string, string>();
    for (const z of zones ?? []) {
      if (z.claimedByAmbassadorId && !m.has(z.claimedByAmbassadorId)) {
        m.set(z.claimedByAmbassadorId, palette[m.size % palette.length]);
      }
    }
    return m;
  }, [zones]);

  return (
    <div>
      <div className="salon-map-filters">
        <input
          className="salon-map-search"
          placeholder="🔍 Rechercher…"
          value={f.state.search}
          onChange={(e) => f.setters.setSearch(e.target.value)}
        />
        <select
          className="salon-map-chip"
          value={f.state.city}
          onChange={(e) => { f.setters.setCity(e.target.value); f.setters.setZoneId('all'); }}
        >
          <option value="all">Toutes villes</option>
          {f.cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          className="salon-map-chip"
          value={f.state.zoneId}
          onChange={(e) => f.setters.setZoneId(e.target.value)}
        >
          <option value="all">Toutes zones</option>
          {f.zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
        </select>
        <select
          className="salon-map-chip"
          value={f.state.ambassadorId}
          onChange={(e) => f.setters.setAmbassadorId(e.target.value)}
        >
          <option value="all">Tous ambassadeurs</option>
          {f.ambassadors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <Chip active={f.state.status === 'all'}   onClick={() => f.setters.setStatus('all')}>Tous</Chip>
        <Chip active={f.state.status === 'never'} onClick={() => f.setters.setStatus('never')}>Pas visités</Chip>
        <Chip active={f.state.status === 'r3'}    onClick={() => f.setters.setStatus('r3')}>⭐3</Chip>
        <Chip active={f.state.status === 'r2'}    onClick={() => f.setters.setStatus('r2')}>⭐2</Chip>
        <Chip active={f.state.status === 'r1'}    onClick={() => f.setters.setStatus('r1')}>⭐1</Chip>
        <Chip active={f.state.openNow}            onClick={() => f.setters.setOpenNow(!f.state.openNow)}>🕐 Ouvert</Chip>
        <Chip active={f.state.minRating === 4}    onClick={() => f.setters.setMinRating(f.state.minRating === 4 ? 0 : 4)}>⭐4+</Chip>
        <Chip active={f.state.showClosed}         onClick={() => f.setters.setShowClosed(!f.state.showClosed)}>☠ Fermés</Chip>
        <Chip active={f.state.showBboxes}         onClick={() => f.setters.setShowBboxes(!f.state.showBboxes)}>🔲 Bbox zones</Chip>
      </div>

      <div className="salon-map-wrap">
        <MapContainer
          center={initialBbox
            ? [(initialBbox.minLat + initialBbox.maxLat) / 2, (initialBbox.minLon + initialBbox.maxLon) / 2]
            : PARIS}
          zoom={6}
          scrollWheelZoom
        >
          <TileLayer url={theme === 'dark' ? TILES_DARK : TILES_LIGHT} attribution={TILES_ATTRIB} />
          <FitToBbox bbox={initialBbox ?? null} />
          <LocateButton />

          {f.state.showBboxes && (zones ?? []).map((z) => z.bbox && (
            <Rectangle
              key={z.id}
              bounds={[
                [z.bbox.minLat, z.bbox.minLon],
                [z.bbox.maxLat, z.bbox.maxLon],
              ]}
              pathOptions={{
                color: z.claimedByAmbassadorId ? (ambColor.get(z.claimedByAmbassadorId) ?? '#888') : '#888',
                weight: 1.5,
                fillOpacity: z.claimedByAmbassadorId ? 0.12 : 0.05,
                dashArray: z.claimedByAmbassadorId ? undefined : '4',
              }}
            />
          ))}

          <MarkerClusterGroup chunkedLoading iconCreateFunction={clusterIcon}>
            {f.filtered.map((s) => (
              <Marker key={s.id} position={[s.lat as number, s.lon as number]} icon={adminIcon(s)}>
                <Popup>
                  <AdminPopup salon={s} />
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>
      <div className="salon-map-counter">
        {f.filtered.length} salon{f.filtered.length > 1 ? 's' : ''} affichés / {salons.length}
        {f.state.showBboxes && (zones ?? []).length > 0 && ` · ${(zones ?? []).filter((z) => z.claimedByAmbassadorId).length} zone(s) réservée(s)`}
      </div>
    </div>
  );
}

export default SalonsMap;
