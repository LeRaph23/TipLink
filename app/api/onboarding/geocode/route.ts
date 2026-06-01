import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

interface GeopfFeature {
  properties?: { label?: string };
}

// GET /api/onboarding/geocode?q=...
// Server-side proxy to the IGN Géoplateforme address geocoder.
//
// Proxying (rather than calling data.geopf.fr from the browser) keeps the
// client request same-origin, so it never depends on the CSP connect-src
// allow-list, CORS, or the user's network being able to reach the geocoder.
// Mirrors the /api/onboarding/validate-code proxy pattern. Returns a slim
// list of address labels; the autocomplete only needs the label string.
export async function GET(req: Request) {
  const ip = getClientIp(new Headers(req.headers));
  const rl = await rateLimit(`geocode:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ labels: [] }, { status: 429 });
  }

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 3) {
    return NextResponse.json({ labels: [] });
  }

  try {
    const res = await fetch(
      `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=5`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) {
      console.error('[geocode] upstream returned', res.status);
      return NextResponse.json({ labels: [] }, { status: 502 });
    }
    const data = (await res.json()) as { features?: GeopfFeature[] };
    const labels = (data.features ?? [])
      .map((f) => f.properties?.label)
      .filter((l): l is string => typeof l === 'string');
    return NextResponse.json({ labels });
  } catch (err) {
    console.error('[geocode] lookup failed', err);
    return NextResponse.json({ labels: [] }, { status: 502 });
  }
}
