/**
 * EU VAT number check against VIES, the Commission's register.
 *
 * Reverse charge (no French VAT on a sale to an EU business) is only lawful
 * when the buyer's VAT number is valid. Stripe Tax applies it to any number
 * with a plausible shape, so a made-up "BE0123456789" took 20 % off an order
 * (sixth QA run). The number is now checked here first; only `valid` lets the
 * reverse charge through. `unavailable` (VIES or the member state's service
 * down) charges French VAT: the safe default, and the buyer can ask for a
 * corrected invoice once VIES is back.
 */
export type ViesStatus = 'valid' | 'invalid' | 'unavailable';

const ENDPOINT = 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms';
const TIMEOUT_MS = 6_000;
const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { status: ViesStatus; at: number }>();

/** "BE 0123.456.789" → { country: "BE", number: "0123456789" }; Greece is EL in VIES. */
export function splitVatNumber(raw: string): { country: string; number: string } | null {
  const v = raw.toUpperCase().replace(/[\s.\-]/g, '');
  const m = /^([A-Z]{2})([A-Z0-9]{2,12})$/.exec(v);
  if (!m) return null;
  return { country: m[1] === 'GR' ? 'EL' : m[1], number: m[2] };
}

/** Reads a VIES REST response body. Anything but an explicit answer is `unavailable`. */
export function parseViesResponse(body: unknown): ViesStatus {
  const b = body as { isValid?: unknown; userError?: unknown } | null;
  if (b?.isValid === true) return 'valid';
  if (b?.isValid === false && (b.userError === 'INVALID' || b.userError === 'INVALID_INPUT')) return 'invalid';
  return 'unavailable';
}

export async function checkVatNumber(raw: string): Promise<ViesStatus> {
  const parts = splitVatNumber(raw);
  if (!parts) return 'invalid';
  const key = parts.country + parts.number;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.status;

  let status: ViesStatus;
  try {
    const res = await fetch(`${ENDPOINT}/${parts.country}/vat/${encodeURIComponent(parts.number)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    status = res.ok ? parseViesResponse(await res.json()) : 'unavailable';
  } catch {
    status = 'unavailable';
  }
  // Only definite answers are cached: an outage should not stick for hours.
  if (status !== 'unavailable') cache.set(key, { status, at: Date.now() });
  return status;
}
