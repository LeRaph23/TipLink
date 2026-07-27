// Launch-offer deadline. Pure functions, no I/O — the caller supplies both the
// configured end date and "now", so this is directly unit-testable and safe to
// import from client components.
//
// The deadline is announced in the landing promo banner. It is deliberately
// opt-in: with no NEXT_PUBLIC_LAUNCH_OFFER_ENDS_AT set, or once the date has
// passed, `launchOfferState` reports `active: false` and the banner shows its
// evergreen text. An offer that never actually ends must not display a
// countdown — a perpetually-renewed "ends soon" deadline is the fake-urgency
// pattern the DGCCRF treats as a misleading commercial practice.

export type LaunchOfferState =
  | { active: false }
  | { active: true; endsAt: Date; daysLeft: number };

/**
 * Parse a `YYYY-MM-DD` offer end date as the *end* of that day in UTC, so an
 * offer dated 2026-08-31 stays live for the whole of 31 August.
 * Returns null for missing or malformed input rather than throwing: a bad
 * value should degrade to "no offer", never break the landing page.
 */
export function parseOfferEnd(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const ts = Date.UTC(Number(y), Number(mo) - 1, Number(d), 23, 59, 59, 999);
  const date = new Date(ts);
  // Rejects impossible dates that Date.UTC would silently roll over
  // (2026-02-30 → 2 March), which would announce a deadline nobody set.
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(mo) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}

export function launchOfferState(
  raw: string | undefined | null,
  now: Date = new Date()
): LaunchOfferState {
  const endsAt = parseOfferEnd(raw);
  if (!endsAt || endsAt.getTime() <= now.getTime()) return { active: false };
  const daysLeft = Math.max(
    1,
    Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000)
  );
  return { active: true, endsAt, daysLeft };
}

/** Format the deadline for display, e.g. "31 août 2026". */
export function formatOfferEnd(endsAt: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(endsAt);
}
