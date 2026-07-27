import type { ComponentType } from 'react';

// Explicit import map — see content/guides/registry.ts for the rationale.
export const SOLUTION_BODIES: Record<string, () => Promise<{ default: ComponentType }>> = {
  restaurant: () => import('./body/restaurant'),
  bar: () => import('./body/bar'),
  cafe: () => import('./body/cafe'),
  coiffeur: () => import('./body/coiffeur'),
};
