import { describe, it, expect } from 'vitest';
import { generateIdempotencyKey } from '@/lib/mangopay/idempotency';

describe('generateIdempotencyKey', () => {
  it('is deterministic for the same inputs', () => {
    const a = generateIdempotencyKey({ scope: 'staff-1', amount: 525, nonce: 'nonce-abcdef' });
    const b = generateIdempotencyKey({ scope: 'staff-1', amount: 525, nonce: 'nonce-abcdef' });
    expect(a).toBe(b);
  });

  it('changes when the scope changes', () => {
    const a = generateIdempotencyKey({ scope: 'staff-1', amount: 525, nonce: 'nonce-abcdef' });
    const b = generateIdempotencyKey({ scope: 'staff-2', amount: 525, nonce: 'nonce-abcdef' });
    expect(a).not.toBe(b);
  });

  it('changes when the amount changes', () => {
    const a = generateIdempotencyKey({ scope: 'staff-1', amount: 525, nonce: 'nonce-abcdef' });
    const b = generateIdempotencyKey({ scope: 'staff-1', amount: 1025, nonce: 'nonce-abcdef' });
    expect(a).not.toBe(b);
  });

  it('changes when the nonce changes', () => {
    const a = generateIdempotencyKey({ scope: 'staff-1', amount: 525, nonce: 'nonce-abcdef' });
    const b = generateIdempotencyKey({ scope: 'staff-1', amount: 525, nonce: 'nonce-zzzzzz' });
    expect(a).not.toBe(b);
  });

  it('produces a 40-char hex key', () => {
    const key = generateIdempotencyKey({ scope: 'pack-express:solo', amount: 8280, nonce: 'nonce-abcdef' });
    expect(key).toMatch(/^[0-9a-f]{40}$/);
  });
});
