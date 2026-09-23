import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { adContextMetadata } from '@/lib/marketing/ad-context';
import { attributionFromUrl, serializeAttribution } from '@/lib/marketing/attribution';

const attribution = attributionFromUrl(
  new URLSearchParams('utm_source=meta&utm_campaign=test1'),
  '/fr/solutions/tatoueur',
  new Date('2026-09-23T10:00:00Z'),
)!;

function request(cookies: Record<string, string>) {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');
  return new NextRequest('https://digitip.app/api/billing/checkout', {
    method: 'POST',
    headers: { cookie, 'user-agent': 'Mozilla/5.0 test', 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
  });
}

describe('adContextMetadata', () => {
  it('carries the campaign whatever the consent, and nothing that identifies the buyer', () => {
    const meta = adContextMetadata(request({ dt_attr: serializeAttribution(attribution), _fbp: 'fb.1.1700000000000.42' }));
    expect(meta.attr_source).toBe('meta');
    expect(meta.attr_campaign).toBe('test1');
    expect(meta.attr_landing).toBe('/solutions/tatoueur');
    expect(meta).not.toHaveProperty('ad_consent');
    expect(meta).not.toHaveProperty('meta_fbp');
    expect(meta).not.toHaveProperty('client_ip');
    expect(meta).not.toHaveProperty('client_ua');
  });

  it('adds what the Conversions API needs once consent is granted', () => {
    const meta = adContextMetadata(request({
      dt_consent: 'granted',
      _fbp: 'fb.1.1700000000000.42',
      _fbc: 'fb.1.1700000000000.IwAR123',
    }));
    expect(meta).toMatchObject({
      ad_consent: 'granted',
      meta_fbp: 'fb.1.1700000000000.42',
      meta_fbc: 'fb.1.1700000000000.IwAR123',
      client_ip: '203.0.113.7',
      client_ua: 'Mozilla/5.0 test',
    });
    expect(meta).not.toHaveProperty('attr_source');
  });

  it('treats a refusal like no answer, and drops malformed Meta cookies', () => {
    expect(adContextMetadata(request({ dt_consent: 'denied', _fbp: 'fb.1.1.1' }))).toEqual({});
    const meta = adContextMetadata(request({ dt_consent: 'granted', _fbp: 'evil<script>' }));
    expect(meta).not.toHaveProperty('meta_fbp');
  });
});
