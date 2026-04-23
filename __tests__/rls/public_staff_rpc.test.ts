/**
 * RPC `get_public_staff` safety tests.
 *
 * - Anon can call the RPC (SECURITY DEFINER + explicit GRANT).
 * - The RPC NEVER exposes sensitive columns (stripe_account_id,
 *   user_id, establishment_id).
 * - `is_payable` correctly reflects onboarding state.
 *
 * Prerequisites: npx supabase start
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://localhost:54321';
const SERVICE_KEY = process.env.SUPABASE_LOCAL_SERVICE_KEY ?? '';
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY ?? '';

const skipIfNoLocal = !SERVICE_KEY || !ANON_KEY;

describe.skipIf(skipIfNoLocal)('get_public_staff RPC', () => {
  const serviceClient = skipIfNoLocal
    ? (null as unknown as ReturnType<typeof createClient>)
    : createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

  let groupId: string;
  let establishmentId: string;
  let staffReadyId: string;
  let staffNotReadyId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const { data: group } = await serviceClient
      .from('groups')
      .insert({ name: `RPC Test Group ${ts}`, settings: {} })
      .select('id')
      .single();
    groupId = group!.id;

    const { data: est } = await serviceClient
      .from('establishments')
      .insert({
        group_id: groupId,
        name: 'RPC Test Est',
        business_type: 'restaurant',
        slug: `rpc-test-est-${ts}`,
        country: 'FR',
        currency: 'EUR',
      })
      .select('id')
      .single();
    establishmentId = est!.id;

    const { data: ready } = await serviceClient
      .from('staff_profiles')
      .insert({
        establishment_id: establishmentId,
        full_name: 'Ready Staff',
        stripe_account_id: 'acct_ready',
        onboarding_status: 'complete',
      })
      .select('id')
      .single();
    staffReadyId = ready!.id;

    const { data: notReady } = await serviceClient
      .from('staff_profiles')
      .insert({
        establishment_id: establishmentId,
        full_name: 'Pending Staff',
        onboarding_status: 'pending',
      })
      .select('id')
      .single();
    staffNotReadyId = notReady!.id;
  });

  afterAll(async () => {
    await serviceClient
      .from('staff_profiles')
      .delete()
      .in('id', [staffReadyId, staffNotReadyId]);
    await serviceClient.from('establishments').delete().eq('id', establishmentId);
    await serviceClient.from('groups').delete().eq('id', groupId);
  });

  it('anon can call the RPC and get whitelisted columns only', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data, error } = await anon.rpc('get_public_staff', {
      p_staff_id: staffReadyId,
    });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data!.length).toBe(1);

    const row = data![0] as Record<string, unknown>;
    expect(row.full_name).toBe('Ready Staff');
    expect(row.is_payable).toBe(true);

    // Sensitive columns must NOT leak through.
    expect(row).not.toHaveProperty('stripe_account_id');
    expect(row).not.toHaveProperty('user_id');
    expect(row).not.toHaveProperty('establishment_id');
  });

  it('is_payable is false when onboarding is not complete', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data } = await anon.rpc('get_public_staff', {
      p_staff_id: staffNotReadyId,
    });
    expect((data![0] as Record<string, unknown>).is_payable).toBe(false);
  });

  it('anon CANNOT SELECT staff_profiles.stripe_account_id directly', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data } = await anon
      .from('staff_profiles')
      .select('stripe_account_id')
      .eq('id', staffReadyId);
    // RLS blocks anon (no role), so result is empty (or null data).
    expect(data === null || data.length === 0).toBe(true);
  });
});
