// Shared helpers for salon opening-hours and Maps links — used by both the
// ambassador dashboard and the super-admin map.

export type OpeningHours = {
  weekdayDescriptions?: string[];
  periods?: Array<{
    open?: { day: number; hour: number; minute: number };
    close?: { day: number; hour: number; minute: number };
  }>;
} | null;

export const WEEKDAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

/**
 * Is the salon open right now according to its Google opening_hours?
 * Returns null if we can't tell (no hours data).
 */
export function isOpenNow(
  hours: OpeningHours,
  at: Date = new Date()
): { open: boolean; nextChange: string | null } | null {
  if (!hours?.periods?.length) return null;
  const day = at.getDay(); // 0 = Sunday, matching Google's day index
  const minutesNow = at.getHours() * 60 + at.getMinutes();

  for (const p of hours.periods) {
    if (!p.open || !p.close) continue;
    if (p.open.day === day && p.close.day === day) {
      const openM = p.open.hour * 60 + p.open.minute;
      const closeM = p.close.hour * 60 + p.close.minute;
      if (minutesNow >= openM && minutesNow < closeM) {
        const h = Math.floor(closeM / 60);
        const m = closeM % 60;
        return { open: true, nextChange: `Ferme à ${h}h${m.toString().padStart(2, '0')}` };
      }
    }
  }

  // Find next opening today
  for (const p of hours.periods) {
    if (!p.open) continue;
    if (p.open.day === day) {
      const openM = p.open.hour * 60 + p.open.minute;
      if (openM > minutesNow) {
        return {
          open: false,
          nextChange: `Ouvre à ${p.open.hour}h${p.open.minute.toString().padStart(2, '0')}`,
        };
      }
    }
  }

  return { open: false, nextChange: null };
}

/**
 * Build a Google Maps link for a salon, prioritizing precise GPS over text.
 */
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
