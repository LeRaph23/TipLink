'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { loadConnectAndInitialize, type StripeConnectInstance } from '@stripe/connect-js';
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

// Custom properties resolve lazily: `getPropertyValue('--font')` hands back the
// literal token stream — `var(--font-jakarta, 'Plus Jakarta Sans', …)` — not the
// family it eventually resolves to. Inside Stripe's iframe `--font-jakarta` does
// not exist, so the whole declaration is invalid and the form falls back to the
// browser default, which is a serif. That is why the embedded onboarding used to
// render in Times while the rest of the wizard was Plus Jakarta Sans.
//
// Reading `font-family` off <body> instead gives a stack that is already
// resolved. Its first entries are next/font's generated names, which mean
// nothing in the iframe and are skipped harmlessly; what matters is that a real
// family — `-apple-system` and friends — now terminates the list.
function resolveFontStack(): string {
  const computed = getComputedStyle(document.body).fontFamily.trim();
  if (computed.length > 0 && !computed.includes('var(')) return computed;
  return "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
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
    fontFamily: resolveFontStack(),
    spacingUnit: '9px',
  };
}

type Props = {
  establishmentId: string;
  /** Signed onboarding token, for wizard steps that run without a session. */
  token?: string;
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
  children,
  errorFallback = null,
}: Props) {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    const res = await fetch('/api/stripe/account-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ establishmentId, ...(token ? { token } : {}) }),
    });
    if (!res.ok) throw new Error(`account-session failed with ${res.status}`);
    const data = (await res.json()) as { clientSecret?: string };
    if (!data.clientSecret) throw new Error('account-session returned no client secret');
    return data.clientSecret;
  }, [establishmentId, token]);

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
