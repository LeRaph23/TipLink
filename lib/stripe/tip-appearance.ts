import type { Appearance } from '@stripe/stripe-js';

// The card form sits inside Stripe's iframe, which inherits nothing from the
// page: `theme: 'night'` on the light tip page drew near-invisible labels, and
// `fontFamily: 'inherit'` fell back to a serif (sixth QA run). Colours follow
// the site theme, and the font is a system stack the iframe can resolve.
//
// The values mirror the v2 tokens in app/globals.css (the iframe cannot read
// CSS variables): rose 600 is the light accent because #E57A97 fails contrast
// on white, rose 400 the dark one; fields take the 10 px control radius.
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export function tipElementsAppearance(): Appearance {
  const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  return dark
    ? {
        theme: 'night',
        variables: {
          colorPrimary: '#e57a97',
          colorBackground: '#1b1617',
          colorText: '#f6f2f3',
          colorTextSecondary: '#c3bcbd',
          colorTextPlaceholder: '#a49c9e',
          colorDanger: '#ff9786',
          borderRadius: '10px',
          fontFamily: FONT,
          fontSizeBase: '16px',
        },
        rules: {
          '.Label': { color: '#c3bcbd', fontWeight: '500', fontSize: '14px' },
          '.Input': { border: '1px solid #383132', boxShadow: 'none' },
          '.Input:focus': { border: '1px solid #e57a97', boxShadow: 'inset 0 0 0 1px #e57a97' },
          '.Tab': { border: '1px solid #383132', boxShadow: 'none' },
        },
      }
    : {
        theme: 'stripe',
        variables: {
          colorPrimary: '#af4a69',
          colorBackground: '#ffffff',
          colorText: '#171213',
          colorTextSecondary: '#5a5355',
          colorTextPlaceholder: '#6e6768',
          colorDanger: '#a43c2f',
          borderRadius: '10px',
          fontFamily: FONT,
          fontSizeBase: '16px',
        },
        rules: {
          '.Label': { color: '#5a5355', fontWeight: '500', fontSize: '14px' },
          '.Input': { border: '1px solid #e4dedf', boxShadow: 'none' },
          '.Input:focus': { border: '1px solid #af4a69', boxShadow: 'inset 0 0 0 1px #af4a69' },
          '.Tab': { border: '1px solid #e4dedf', boxShadow: 'none' },
        },
      };
}
