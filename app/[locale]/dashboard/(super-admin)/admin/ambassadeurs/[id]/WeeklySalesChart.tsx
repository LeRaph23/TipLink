'use client';

import dynamic from 'next/dynamic';

export type WeeklySalesPoint = { label: string; ventes: number; commission: number };

/**
 * Lazy boundary for the one chart on the ambassador detail page.
 *
 * recharts was imported at the top of AmbassadeurDetail.tsx, a 400-line
 * component whose other job is the admin controls (freeze payouts, regenerate
 * a setup token). Those controls had to wait behind a plotting library to
 * become interactive. Extracting the chart lets the rest of the page hydrate
 * without it, and matches how leaflet is already handled elsewhere in this
 * dashboard.
 */
const Impl = dynamic(() => import('./WeeklySalesChartImpl').then((m) => m.WeeklySalesChartImpl), {
  ssr: false,
  loading: () => (
    <div className="shimmer" style={{ height: 200, borderRadius: 12, background: 'var(--surface-2)' }} />
  ),
});

export function WeeklySalesChart({ data }: { data: WeeklySalesPoint[] }) {
  return <Impl data={data} />;
}
