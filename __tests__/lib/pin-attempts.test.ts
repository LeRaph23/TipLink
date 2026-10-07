import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  registerPinAttempt,
  PIN_MAX_CODE_ATTEMPTS,
  PIN_MAX_DAY_ATTEMPTS,
  PIN_MAX_IP_ATTEMPTS,
} from '@/lib/auth/pin-attempts';

function fakeService(rpcResult: { data: unknown; error: unknown }, dayCount = 0) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const gte = vi.fn().mockResolvedValue({ count: dayCount });
  const eq = vi.fn(() => ({ gte }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from, eq };
}

describe('registerPinAttempt', () => {
  it('records the attempt through the atomic RPC, with the code and IP hash', async () => {
    const { client, rpc } = fakeService({ data: [{ ip_count: 1, code_count: 1 }], error: null });
    await expect(registerPinAttempt(client, 'ambassador', 'ABCD', 'hash')).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('register_pin_attempt', expect.objectContaining({
      p_portal: 'ambassador', p_code: 'ABCD', p_ip_hash: 'hash',
    }));
  });

  it('refuses once the per-IP cap is passed', async () => {
    const { client } = fakeService({ data: [{ ip_count: PIN_MAX_IP_ATTEMPTS + 1, code_count: 2 }], error: null });
    await expect(registerPinAttempt(client, 'commercial', 'c', 'h')).resolves.toEqual({ ok: false, reason: 'ip' });
  });

  it('refuses once the per-code cap is passed, whatever the IP', async () => {
    const { client } = fakeService({ data: [{ ip_count: 1, code_count: PIN_MAX_CODE_ATTEMPTS + 1 }], error: null });
    await expect(registerPinAttempt(client, 'ambassador', 'c', 'h')).resolves.toEqual({ ok: false, reason: 'code' });
  });

  it('refuses once the daily cap on the code is passed', async () => {
    const { client, eq } = fakeService({ data: [{ ip_count: 1, code_count: 1 }], error: null }, PIN_MAX_DAY_ATTEMPTS + 1);
    await expect(registerPinAttempt(client, 'ambassador', 'ABCD', 'h')).resolves.toEqual({ ok: false, reason: 'day' });
    expect(eq).toHaveBeenCalledWith('code', 'abcd');
  });

  it('fails closed when the attempt cannot be recorded', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeService({ data: null, error: { message: 'down' } });
    await expect(registerPinAttempt(client, 'ambassador', 'c', 'h')).resolves.toEqual({ ok: false, reason: 'error' });
    spy.mockRestore();
  });
});
