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

// "Friday" → 5 (matching JS getDay() / Google's day index).
const WEEKDAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

// Compute the local weekday + minutes-of-day for an instant in a given IANA timezone.
function localDayAndMinutes(at: Date, timezone: string): { day: number; minutes: number } {
  // Intl.DateTimeFormat with `weekday: long` and 24h time emits values for the
  // requested timezone; this is the cheapest reliable conversion in pure JS.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  let weekday = 'Sunday';
  let hour = 0;
  let minute = 0;
  for (const part of fmt.formatToParts(at)) {
    if (part.type === 'weekday') weekday = part.value;
    if (part.type === 'hour') hour = part.value === '24' ? 0 : parseInt(part.value, 10);
    if (part.type === 'minute') minute = parseInt(part.value, 10);
  }
  return { day: WEEKDAY_INDEX[weekday] ?? at.getDay(), minutes: hour * 60 + minute };
}

/**
 * Is the salon open right now according to its Google opening_hours?
 * Returns null if we can't tell (no hours data).
 *
 * `timezone` is the salon's IANA timezone (e.g. "Europe/Paris"). When omitted
 * the salon's local time is assumed to match the host's — only safe in tests
 * or for back-compat with call sites that don't yet have the column.
 */
export function isOpenNow(
  hours: OpeningHours,
  at: Date = new Date(),
  timezone: string = 'Europe/Paris'
): { open: boolean; nextChange: string | null } | null {
  if (!hours?.periods?.length) return null;

  let day: number;
  let minutesNow: number;
  try {
    const local = localDayAndMinutes(at, timezone);
    day = local.day;
    minutesNow = local.minutes;
  } catch {
    day = at.getDay();
    minutesNow = at.getHours() * 60 + at.getMinutes();
  }

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
