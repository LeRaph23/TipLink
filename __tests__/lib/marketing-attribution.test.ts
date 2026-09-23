import { describe, it, expect } from 'vitest';
import {
  attributionFromMetadata,
  attributionFromUrl,
  attributionToMetadata,
  parseAttributionCookie,
  serializeAttribution,
  summarizeAttribution,
} from '@/lib/marketing/attribution';
import { isMarketingPath, parseConsent, stripLocale } from '@/lib/marketing/consent';

const NOW = new Date('2026-09-23T10:00:00Z');

describe('attributionFromUrl', () => {
  it('reads the campaign parameters an ad link carries', () => {
    const params = new URLSearchParams(
      'utm_source=Meta&utm_medium=Paid&utm_campaign=test1&utm_content=video-cash&fbclid=abc',
    );
    expect(attributionFromUrl(params, '/fr/solutions/tatoueur', NOW)).toEqual({
      source: 'meta',
      medium: 'paid',
      campaign: 'test1',
      content: 'video-cash',
      term: null,
      landing: '/solutions/tatoueur',
      at: NOW.toISOString(),
    });
  });

  it('ignores a visit with no utm_source, even with a click id', () => {
    expect(attributionFromUrl(new URLSearchParams('utm_campaign=x&fbclid=abc'), '/fr', NOW)).toBeNull();
  });

  it('never keeps the Meta click id: it is an identifier, and this runs without consent', () => {
    const a = attributionFromUrl(new URLSearchParams('utm_source=meta&fbclid=IwAR123'), '/fr', NOW);
    expect(JSON.stringify(a)).not.toContain('IwAR123');
  });

  it('strips markup and caps length on values anyone can type', () => {
    const long = 'x'.repeat(300);
    const a = attributionFromUrl(
      new URLSearchParams(`utm_source=<script>meta&utm_campaign=${long}`),
      '/en',
      NOW,
    );
    expect(a?.source).toBe('scriptmeta');
    expect(a?.campaign).toHaveLength(100);
    expect(a?.landing).toBe('/');
  });
});

describe('attribution cookie and Stripe metadata', () => {
  const a = attributionFromUrl(
    new URLSearchParams('utm_source=meta&utm_campaign=test1'),
    '/fr/checkout',
    NOW,
  )!;

  it('round-trips through the cookie', () => {
    expect(parseAttributionCookie(serializeAttribution(a))).toEqual(a);
  });

  it('reads a malformed or tampered cookie as absent', () => {
    expect(parseAttributionCookie('not-json')).toBeNull();
    expect(parseAttributionCookie(encodeURIComponent('{"campaign":"x"}'))).toBeNull();
    expect(parseAttributionCookie(undefined)).toBeNull();
  });

  it('round-trips through PaymentIntent metadata, which only holds strings', () => {
    const metadata = { source: 'pack-order', ...attributionToMetadata(a) };
    expect(Object.values(metadata).every((v) => typeof v === 'string')).toBe(true);
    expect(attributionFromMetadata(metadata)).toEqual(a);
  });

  it('adds nothing to the metadata when there is no attribution', () => {
    expect(attributionToMetadata(null)).toEqual({});
    expect(attributionFromMetadata({ source: 'pack-express' })).toBeNull();
  });
});

describe('summarizeAttribution', () => {
  it('counts orders per source and campaign, busiest first, direct last', () => {
    const rows = summarizeAttribution([
      { attribution: null },
      { attribution: { source: 'meta', campaign: 'test1' } },
      { attribution: { source: 'meta', campaign: 'test1' } },
      { attribution: { source: 'meta', campaign: 'test2' } },
      { attribution: null },
      { attribution: null },
    ]);
    expect(rows).toEqual([
      { source: 'meta', campaign: 'test1', orders: 2 },
      { source: 'meta', campaign: 'test2', orders: 1 },
      { source: null, campaign: null, orders: 3 },
    ]);
  });
});

describe('consent helpers', () => {
  it('only accepts the two known answers', () => {
    expect(parseConsent('granted')).toBe('granted');
    expect(parseConsent('denied')).toBe('denied');
    expect(parseConsent('yes')).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
  });

  it('asks on the pages an ad leads to, never on the tipping page or dashboards', () => {
    for (const p of ['/', '/solutions/tatoueur', '/pricing', '/checkout', '/order/solo', '/order/success']) {
      expect(isMarketingPath(p)).toBe(true);
    }
    for (const p of ['/pay/group/123', '/dashboard', '/receipt/abc', '/join/x', '/onboarding', '/pricingx']) {
      expect(isMarketingPath(p)).toBe(false);
    }
  });

  it('strips the locale prefix', () => {
    expect(stripLocale('/fr')).toBe('/');
    expect(stripLocale('/en/order/duo')).toBe('/order/duo');
    expect(stripLocale('/french')).toBe('/french');
  });
});
