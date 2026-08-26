'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  loadConnectAndInitialize,
  type CustomFontSource,
  type StripeConnectInstance,
} from '@stripe/connect-js';
import { ConnectComponentsProvider } from '@stripe/react-connect-js';

// Connect embedded components render inside a Stripe-hosted iframe, so they
// cannot see our stylesheet: `var(--accent)` means nothing in there. Every
// value has to be resolved to a concrete colour on this side and handed over
// through the appearance API — which is also why the whole palette has to be
// re-pushed when the user flips the theme toggle.

const FALLBACK = {
  colorPrimary: '#E57A97',
  colorBackground: '#ffffff',
  colorText: '#111111',
  colorSecondaryText: '#6b7280',
  colorBorder: '#e5e7eb',
  colorDanger: '#dc2626',
};

type Appearance = Record<string, string>;

function cssVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const raw = styles.getPropertyValue(name).trim();
  return raw.length > 0 ? raw : fallback;
}

// The font the rest of the wizard is set in.
//
// This used to be read from the `--font` custom property, which does not work:
// custom properties resolve lazily, so `getPropertyValue('--font')` hands back
// the literal token stream `var(--font-jakarta, …)` rather than the family it
// resolves to. Inside Stripe's iframe that variable does not exist, the whole
// declaration is invalid, and the form falls back to the browser default — which
// is why the embedded onboarding rendered in Times. Naming the family outright
// is both correct and deterministic.
const BRAND_FONT_STACK =
  "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// next/font serves Plus Jakarta Sans under a hashed, build-specific URL that the
// iframe has no way to guess, so a stable copy lives in /public/fonts and is
// handed to Connect.js explicitly. It needs `Access-Control-Allow-Origin` to be
// readable from Stripe's origin — see the /fonts rule in next.config.ts.
//
// One variable woff2 covers the whole range; each entry below pins a weight
// against that same file, exactly as Google Fonts does for this family. The
// browser fetches the 27 KB once and instantiates the rest.
const FONT_FILE = '/fonts/plus-jakarta-sans-latin.woff2';
const FONT_WEIGHTS = ['400', '500', '600', '700'];

function brandFonts(): CustomFontSource[] {
  const src = `url(${window.location.origin}${FONT_FILE})`;
  return FONT_WEIGHTS.map((weight) => ({
    family: 'Plus Jakarta Sans',
    src,
    weight,
    display: 'swap',
  }));
}

function readAppearance(): Appearance {
  const s = getComputedStyle(document.documentElement);
  return {
    colorPrimary: cssVar(s, '--accent', FALLBACK.colorPrimary),
    colorBackground: cssVar(s, '--surface', FALLBACK.colorBackground),
    colorText: cssVar(s, '--text', FALLBACK.colorText),
    colorSecondaryText: cssVar(s, '--text-3', FALLBACK.colorSecondaryText),
    colorBorder: cssVar(s, '--border', FALLBACK.colorBorder),
    colorDanger: cssVar(s, '--error', FALLBACK.colorDanger),
    buttonPrimaryColorBackground: cssVar(s, '--accent', FALLBACK.colorPrimary),
    buttonPrimaryColorText: '#ffffff',
    formHighlightColorBorder: cssVar(s, '--accent', FALLBACK.colorPrimary),
    // Matches the wizard's own inputs and buttons (12–14px radii) so the
    // embedded form does not read as a foreign widget.
    borderRadius: '12px',
    buttonBorderRadius: '14px',
    fontFamily: BRAND_FONT_STACK,
    spacingUnit: '9px',
  };
}

type Props = {
  establishmentId: string;
  /** Signed onboarding token, for wizard steps that run without a session. */
  token?: string;
  /**
   * Company or sole trader. Forwarded on every session request but only read by
   * the one that creates the account, which is this component mounting.
   */
  legalForm?: 'company' | 'individual';
  children: React.ReactNode;
  /** Rendered when Connect.js cannot be initialised at all. */
  errorFallback?: React.ReactNode;
};

/**
 * Boots Connect.js for one establishment and provides it to the embedded
 * components below.
 *
 * Import this through `next/dynamic` with `ssr: false`: Connect.js reaches for
 * `window` and `getComputedStyle` as it initialises, and the iframe has nothing
 * meaningful to render on the server anyway.
 *
 * `fetchClientSecret` is called by Stripe on mount and again whenever the
 * session needs refreshing, so it has to stay callable for the lifetime of the
 * instance rather than resolving once.
 */
export function ConnectProvider({
  establishmentId,
  token,
  legalForm,
  children,
  errorFallback = null,
}: Props) {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    const res = await fetch('/api/stripe/account-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        establishmentId,
        ...(token ? { token } : {}),
        ...(legalForm ? { legalForm } : {}),
      }),
    });
    if (!res.ok) throw new Error(`account-session failed with ${res.status}`);
    const data = (await res.json()) as { clientSecret?: string };
    if (!data.clientSecret) throw new Error('account-session returned no client secret');
    return data.clientSecret;
  }, [establishmentId, token, legalForm]);

  // Initialised once per establishment, during render. Re-creating the instance
  // would tear down a half-filled onboarding form, so `fetchClientSecret` is
  // deliberately left out of the dependencies — Connect.js holds the first
  // reference and keeps calling it, and its identity only changes alongside the
  // establishment anyway.
  const instance: StripeConnectInstance | null = useMemo(() => {
    if (typeof window === 'undefined' || !publishableKey) return null;
    try {
      return loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret,
        appearance: { variables: readAppearance() },
        fonts: brandFonts(),
      });
    } catch (err) {
      console.error('[connect] initialisation failed', err);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishableKey, establishmentId]);

  // Re-push the palette when the theme toggle rewrites `data-theme` on <html>.
  // Without this the iframe keeps the colours it was born with, and the form
  // stays light-on-light (or dark-on-dark) after a switch.
  useEffect(() => {
    if (!instance) return;
    const observer = new MutationObserver(() => {
      instance.update({ appearance: { variables: readAppearance() } });
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, [instance]);

  if (!instance) return <>{errorFallback}</>;

  return (
    <ConnectComponentsProvider connectInstance={instance}>
      {children}
    </ConnectComponentsProvider>
  );
}
