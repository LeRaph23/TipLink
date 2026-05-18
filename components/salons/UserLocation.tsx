'use client';

import { useState } from 'react';
import { Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';

// A Google-Maps-style blue dot for the user's own position.
function userDotIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html:
      '<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;' +
      'border:3px solid #fff;box-shadow:0 0 0 2px rgba(37,99,235,0.45),0 1px 5px rgba(0,0,0,0.45);"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/**
 * "Locate me" control: a floating button that, on tap, asks for the device
 * position, recentres the map on it and drops a live blue dot (with an
 * accuracy halo). Re-tapping recentres on the latest fix.
 */
export function UserLocation() {
  const map = useMap();
  const [pos, setPos] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
        setPos(next);
        setLocating(false);
        map.flyTo([next.lat, next.lon], 15, { duration: 0.8 });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
  };

  return (
    <>
      <button
        className="salon-map-locate"
        onClick={locate}
        title="Me localiser"
        aria-label="Me localiser"
      >
        {locating ? '⏳' : '📍'}
      </button>
      {pos && (
        <>
          {pos.accuracy > 0 && pos.accuracy < 2000 && (
            <Circle
              center={[pos.lat, pos.lon]}
              radius={pos.accuracy}
              pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.1, weight: 1 }}
            />
          )}
          <Marker position={[pos.lat, pos.lon]} icon={userDotIcon()} zIndexOffset={1000} />
        </>
      )}
    </>
  );
}

export default UserLocation;
