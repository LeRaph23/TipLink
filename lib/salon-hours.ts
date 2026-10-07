// Maps link for a salon, used by both the ambassador dashboard and the
// super-admin map.
//
// This file used to also read Google opening hours stored on the salon. Google's
// Places terms allow storing the place ID only, so the hours are no longer kept
// (migration 00089) and the "open now" helpers went with them.

export function mapsLink(input: {
  lat?: number | null;
  lon?: number | null;
  name?: string;
  address?: string | null;
  postal_code?: string | null;
}): string {
  if (input.lat != null && input.lon != null) {
    return `https://www.google.com/maps/search/?api=1&query=${input.lat},${input.lon}`;
  }
  const q = encodeURIComponent(
    [input.name, input.address ?? '', input.postal_code ?? ''].filter(Boolean).join(' ')
  );
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
