'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy boundary for recharts.
 *
 * recharts pulls in a large slice of d3, and it was imported statically here
 * while leaflet — the other heavy client dependency in this codebase — was
 * already behind next/dynamic (see SalonsManager.tsx). Loading it on demand
 * lets the page paint its numbers first and fetch the plotting library after,
 * which matters because the figures above the charts are the part a manager
 * actually came for.
 *
 * ssr: false because recharts measures the DOM to lay a chart out; there is
 * nothing useful to render on the server.
 */
const PilotageChartsImpl = dynamic(
  () => import('./PilotageChartsImpl').then((m) => m.PilotageChartsImpl),
  {
    ssr: false,
    loading: () => (
      <div
        className="shimmer"
        style={{ height: 260, borderRadius: 14, background: 'var(--surface-2)' }}
      />
    ),
  },
);

export const PilotageCharts = PilotageChartsImpl;

// Types stay importable from this path: they cost nothing at runtime and the
// callers should not have to know the component is code-split.
export type { WeeklyPoint, TopPoint } from './PilotageChartsImpl';
