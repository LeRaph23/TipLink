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
  if (path === '/') {
    // The homepage is where the ads land: without this, a campaign optimised
    // for content views would have nothing to learn from.
    trackPixel('ViewContent', { content_name: 'home' });
  } else if (solution) {
    trackPixel('ViewContent', { content_name: solution[1], content_category: 'solution' });
  } else if (path === '/pricing') {
    trackPixel('ViewContent', { content_name: 'pricing' });
  } else if (path === '/checkout' || /^\/order\/(solo|duo)$/.test(path)) {
    // Once per visit: switching pack in the wizard changes the URL, and that
    // is not a second person starting a checkout.
    if (!checkoutSeen.has('checkout')) {
      checkoutSeen.add('checkout');
      const pack = path.startsWith('/order/')
        ? path.slice('/order/'.length)
        : new URLSearchParams(window.location.search).get('pack');
      trackPixel(
        'InitiateCheckout',
        pack === 'solo' || pack === 'duo'
          ? { content_ids: [pack], content_type: 'product', num_items: 1 }
          : undefined,
      );
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

  // Same size, same colour: the CNIL wants refusing to be exactly as easy and
  // as visible as accepting, so neither button is styled as the default.
  const button = {
    flex: '1 1 0',
    minWidth: 0,
    height: 44,
    padding: '0 16px',
    borderRadius: 10,
    fontSize: 14.5,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    border: 'none',
    background: 'var(--text, #171213)',
    color: 'var(--bg, #fff)',
  } as const;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t('manage')}
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(12px + env(safe-area-inset-bottom))',
        zIndex: 1000,
        maxWidth: 480,
        margin: '0 auto',
        padding: '18px 18px 16px',
        borderRadius: 16,
        background: 'var(--surface, #fff)',
        color: 'var(--text, #171213)',
        border: '1px solid var(--border, #e4e4ec)',
        boxShadow: '0 16px 48px rgba(17, 17, 24, 0.16)',
      }}
    >
      <p style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, margin: '0 0 6px' }}>
        {t('title')}
      </p>
      <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: '0 0 14px', color: 'var(--text-2, #5a5355)' }}>
        {t('text')}{' '}
        <Link href="/privacy" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>
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
