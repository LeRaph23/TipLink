'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_S,
  isMarketingPath,
  parseConsent,
  stripLocale,
  type AdConsent,
} from '@/lib/marketing/consent';
import { loadPixel, revokePixel, trackPixel } from '@/lib/meta/pixel';

export const OPEN_CONSENT_EVENT = 'dt:open-consent';

function readConsent(): AdConsent | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`));
  return parseConsent(match?.[1]);
}

function writeConsent(value: AdConsent) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${CONSENT_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`;
}

/** The standard events an ad-facing page stands for. */
function trackRoute(path: string, checkoutSeen: Set<string>) {
  trackPixel('PageView');
  const solution = path.match(/^\/solutions\/([\w-]+)$/);
  if (solution) {
    trackPixel('ViewContent', { content_name: solution[1], content_category: 'solution' });
  } else if (path === '/pricing') {
    trackPixel('ViewContent', { content_name: 'pricing' });
  } else if (path === '/checkout' || /^\/order\/(solo|duo)$/.test(path)) {
    // Once per visit: switching pack in the wizard changes the URL, and that
    // is not a second person starting a checkout.
    if (!checkoutSeen.has('checkout')) {
      checkoutSeen.add('checkout');
      trackPixel('InitiateCheckout');
    }
  }
}

/**
 * Meta pixel behind an opt-in banner. Renders nothing and loads nothing
 * unless a pixel id is configured, and only ever asks on the pages an ad can
 * lead to (see isMarketingPath). Refusing is one tap, the same as accepting,
 * and the choice can be changed from the privacy policy.
 */
export function MetaPixel({ pixelId }: { pixelId: string }) {
  const t = useTranslations('consent');
  const pathname = usePathname();
  const path = stripLocale(pathname);
  const onMarketingPage = isMarketingPath(path);
  const [consent, setConsent] = useState<AdConsent | null | undefined>(undefined);
  const [forcedOpen, setForcedOpen] = useState(false);
  const checkoutSeen = useRef(new Set<string>());

  useEffect(() => {
    // Cookies are only readable in the browser, so the first render cannot
    // know the answer; `undefined` keeps the banner hidden until it does.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsent(readConsent());
    const open = () => setForcedOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, open);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, open);
  }, []);

  useEffect(() => {
    if (consent !== 'granted' || !onMarketingPage) return;
    loadPixel(pixelId);
    trackRoute(path, checkoutSeen.current);
  }, [consent, onMarketingPage, path, pixelId]);

  const choose = useCallback((value: AdConsent) => {
    writeConsent(value);
    if (value === 'denied') revokePixel();
    setConsent(value);
    setForcedOpen(false);
  }, []);

  const visible = forcedOpen || (consent === null && onMarketingPage);
  if (!visible) return null;

  const button = {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    border: '1px solid var(--border, #e4e4ec)',
    background: 'var(--surface, #fff)',
    color: 'var(--text, #111118)',
  } as const;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t('manage')}
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        zIndex: 1000,
        maxWidth: 520,
        margin: '0 auto',
        padding: 16,
        borderRadius: 14,
        background: 'var(--surface, #fff)',
        color: 'var(--text, #111118)',
        border: '1px solid var(--border, #e4e4ec)',
        boxShadow: '0 12px 40px rgba(17, 17, 24, 0.18)',
      }}
    >
      <p style={{ fontSize: 13.5, lineHeight: 1.55, margin: '0 0 12px' }}>
        {t('text')}{' '}
        <Link href="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>
          {t('learnMore')}
        </Link>
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" style={button} onClick={() => choose('denied')}>
          {t('refuse')}
        </button>
        <button type="button" style={button} onClick={() => choose('granted')}>
          {t('accept')}
        </button>
      </div>
    </div>
  );
}

/** Reopens the banner, so a visitor can withdraw or give consent later. */
export function CookieSettingsLink({ label, style }: { label: string; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        font: 'inherit',
        color: 'inherit',
        textDecoration: 'underline',
        cursor: 'pointer',
        ...style,
      }}
    >
      {label}
    </button>
  );
}
