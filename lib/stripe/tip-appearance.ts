import type { Appearance } from '@stripe/stripe-js';

// The card form sits inside Stripe's iframe, which inherits nothing from the
// page: `theme: 'night'` on the light tip page drew near-invisible labels, and
// `fontFamily: 'inherit'` fell back to a serif (sixth QA run). Colours follow
// the site theme, and the font is a system stack the iframe can resolve.
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export function tipElementsAppearance(): Appearance {
  const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  return dark
    ? {
        theme: 'night',
        variables: {
          colorPrimary: '#E57A97',
          colorText: '#f4f4f6',
          colorTextSecondary: '#c9c9d4',
          colorTextPlaceholder: '#8d8d9c',
          borderRadius: '12px',
          fontFamily: FONT,
        },
        rules: { '.Label': { color: '#e6e6ee', fontWeight: '600' } },
      }
    : {
        theme: 'stripe',
        variables: {
          colorPrimary: '#E57A97',
          colorBackground: '#ffffff',
          colorText: '#0f1020',
          colorTextSecondary: '#4b4d63',
          borderRadius: '12px',
          fontFamily: FONT,
        },
        rules: { '.Label': { color: '#2a2b3d', fontWeight: '600' } },
      };
}
