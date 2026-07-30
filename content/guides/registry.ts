import type { ComponentType } from 'react';

// Explicit import map rather than a template-literal dynamic import: the latter
// works under Turbopack as a context import but is fragile and defeats
// tree-shaking. Adding a guide means adding a line here, which the
// content-registry test cross-checks against content/guides/index.ts.
export const GUIDE_BODIES: Record<string, () => Promise<{ default: ComponentType }>> = {
  'exoneration-pourboires-2026': () => import('./body/exoneration-pourboires-2026'),
  'declarer-les-pourboires': () => import('./body/declarer-les-pourboires'),
  'pourboire-dematerialise': () => import('./body/pourboire-dematerialise'),
};
