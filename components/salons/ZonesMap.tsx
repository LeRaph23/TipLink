'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './salons-map.css';

export type ZoneMapItem = {
  id: string;
  city: string;
  name: string;
  salonCount: number;
  todoCount: number;
  bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number };
};

const TILES_LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILES_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILES_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const FRANCE: [number, number] = [46.7, 2.3];

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

function centroid(b: ZoneMapItem['bbox']): [number, number] {
  return [(b.minLat + b.maxLat) / 2, (b.minLon + b.maxLon) / 2];
}

// Marker bubble shows the count of salons left to canvass: pink when there is
// work left, green check when the zone is fully done, grey when it has no salon.
function zoneIcon(zone: ZoneMapItem): L.DivIcon {
  const allDone = zone.salonCount > 0 && zone.todoCount === 0;
  const empty = zone.salonCount === 0;
  const bg = empty ? '#94a3b8' : allDone ? '#16a34a' : '#E57A97';
  const label = empty ? '–' : allDone ? '✓' : String(zone.todoCount);
  return L.divIcon({
    className: '',
    html:
      `<div style="display:flex;align-items:center;justify-content:center;` +
      `min-width:32px;height:32px;padding:0 8px;background:${bg};color:#fff;` +
      `font-weight:800;font-size:13px;border-radius:99px;border:2px solid #fff;` +
      `box-shadow:0 2px 6px rgba(0,0,0,0.35);">${label}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -16],
  });
}

function FitToZones({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
    } else {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
    }
    fitted.current = true;
  }, [points, map]);
  return null;
}

/** A picker map: one marker per zone, tap a marker to open that zone's salons. */
export function ZonesMap({
  zones,
  onSelect,
}: {
  zones: ZoneMapItem[];
  onSelect: (zone: ZoneMapItem) => void;
}) {
  const theme = useMapTheme();
  const points = zones.map((z) => centroid(z.bbox));

  return (
    <div className="salon-map-wrap">
      <MapContainer center={points[0] ?? FRANCE} zoom={11} scrollWheelZoom>
        <TileLayer url={theme === 'dark' ? TILES_DARK : TILES_LIGHT} attribution={TILES_ATTRIB} />
        <FitToZones points={points} />
        {zones.map((z) => (
          <Marker key={z.id} position={centroid(z.bbox)} icon={zoneIcon(z)}>
            <Popup>
              <div className="salon-popup">
                <div className="salon-popup__title">{z.name}</div>
                <div className="salon-popup__addr">{z.city}</div>
                <div className="salon-popup__visit">
                  {z.salonCount} salon{z.salonCount !== 1 ? 's' : ''}
                  {z.salonCount > 0 &&
                    (z.todoCount > 0 ? ` · ${z.todoCount} à démarcher` : ' · tout démarché ✓')}
                </div>
                <div className="salon-popup__actions">
                  <button className="salon-popup__btn primary" onClick={() => onSelect(z)}>
                    Voir les salons →
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export default ZonesMap;
