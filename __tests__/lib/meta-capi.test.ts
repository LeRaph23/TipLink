import { describe, it, expect } from 'vitest';
import { buildPurchasePayload, sha256, type PurchaseInput } from '@/lib/meta/capi';

const base: PurchaseInput = {
  pixelId: '1234567890',
  accessToken: 'token',
  eventId: 'pi_123',
  eventTime: new Date('2026-09-23T10:00:00Z'),
  eventSourceUrl: 'https://digitip.app/fr/order/success',
  valueCents: 6900,
  currency: 'eur',
  contentId: 'solo',
  quantity: 1,
  email: '  Buyer@Example.com ',
  country: 'FR',
  fbp: 'fb.1.1700000000000.123456',
  fbc: null,
  clientIp: '203.0.113.7',
  userAgent: 'Mozilla/5.0',
};

describe('buildPurchasePayload', () => {
  it('describes the purchase under the PaymentIntent id the browser also uses', () => {
    const [event] = buildPurchasePayload(base).data;
    expect(event.event_name).toBe('Purchase');
    expect(event.event_id).toBe('pi_123');
    expect(event.event_time).toBe(Math.floor(base.eventTime.getTime() / 1000));
    expect(event.custom_data).toEqual({
      value: 69,
      currency: 'EUR',
      content_ids: ['solo'],
      content_type: 'product',
      num_items: 1,
    });
  });

  it('never sends the email or country in clear, and normalises before hashing', () => {
    const [event] = buildPurchasePayload(base).data;
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('Example.com');
    expect(serialized).not.toContain('example.com');
    expect(event.user_data.em).toEqual([sha256('buyer@example.com')]);
    expect(event.user_data.country).toEqual([sha256('fr')]);
  });

  it('omits the fields it does not have instead of sending empty ones', () => {
    const [event] = buildPurchasePayload({ ...base, email: null, fbp: null, clientIp: null }).data;
    expect(event.user_data).not.toHaveProperty('em');
    expect(event.user_data).not.toHaveProperty('fbp');
    expect(event.user_data).not.toHaveProperty('fbc');
    expect(event.user_data).not.toHaveProperty('client_ip_address');
  });

  it('only carries a test code when one is configured', () => {
    expect(buildPurchasePayload(base)).not.toHaveProperty('test_event_code');
    expect(buildPurchasePayload({ ...base, testEventCode: 'TEST42' }).test_event_code).toBe('TEST42');
  });
});
