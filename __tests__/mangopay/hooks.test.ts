// Set the allowlist before lib/env caches it on the first serverEnv() call.
process.env.MANGOPAY_WEBHOOK_ALLOWED_IPS = '192.0.2.0/24, 198.51.100.7';

import { describe, it, expect } from 'vitest';
import { isAllowedWebhookIp } from '@/lib/mangopay/hooks';

describe('isAllowedWebhookIp', () => {
  it('accepts an exact allowlisted IP', () => {
    expect(isAllowedWebhookIp('198.51.100.7')).toBe(true);
  });

  it('accepts an IP inside an allowlisted CIDR range', () => {
    expect(isAllowedWebhookIp('192.0.2.1')).toBe(true);
    expect(isAllowedWebhookIp('192.0.2.254')).toBe(true);
  });

  it('rejects an IP outside every allowlist entry', () => {
    expect(isAllowedWebhookIp('192.0.3.1')).toBe(false);
    expect(isAllowedWebhookIp('203.0.113.9')).toBe(false);
  });

  it('rejects a missing IP', () => {
    expect(isAllowedWebhookIp(null)).toBe(false);
    expect(isAllowedWebhookIp(undefined)).toBe(false);
    expect(isAllowedWebhookIp('')).toBe(false);
  });

  it('normalises an IPv4-mapped IPv6 address', () => {
    expect(isAllowedWebhookIp('::ffff:192.0.2.1')).toBe(true);
    expect(isAllowedWebhookIp('::ffff:192.0.3.1')).toBe(false);
  });
});
