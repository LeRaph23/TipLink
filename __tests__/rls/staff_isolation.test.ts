/**
 * RLS Staff Isolation Tests
 *
 * Verifies that a staff member can only see their own transactions,
 * not those of another staff member in the same establishment.
 *
 * Prerequisites: npx supabase start
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://localhost:54321';
const SERVICE_KEY = process.env.SUPABASE_LOCAL_SERVICE_KEY ?? '';
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY ?? '';

const skipIfNoLocal = !SERVICE_KEY || !ANON_KEY;

describe.skipIf(skipIfNoLocal)('Staff Transaction RLS Isolation', () => {
  const serviceClient = skipIfNoLocal
    ? (null as unknown as ReturnType<typeof createClient>)
    : createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

  let groupId: string;
  let establishmentId: string;
  let staffAId: string;
  let staffBId: string;
  let transactionAId: string;
  let transactionBId: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const { data: group } = await serviceClient
      .from('groups')
      .insert({ name: `Staff Test Group ${ts}`, settings: {} })
      .select('id')
      .single();
    groupId = group!.id;

    const { data: est } = await serviceClient
      .from('establishments')
      .insert({
        group_id: groupId,
        name: 'Staff Test Establishment',
        business_type: 'restaurant',
        slug: `staff-test-est-${ts}`,
        country: 'FR',
        currency: 'EUR',
      })
      .select('id')
      .single();
    establishmentId = est!.id;

    // Create auth users for staff A and B
    const emailA = `staff-a-${ts}@test.local`;
    const emailB = `staff-b-${ts}@test.local`;

    const { data: { user: userA } } = await serviceClient.auth.admin.createUser({
      email: emailA,
      password: 'test-staff-password',
      email_confirm: true,
    });
    userAId = userA!.id;

    const { data: { user: userB } } = await serviceClient.auth.admin.createUser({
      email: emailB,
      password: 'test-staff-password',
      email_confirm: true,
    });
    userBId = userB!.id;

    // Create staff profiles
    const { data: sA } = await serviceClient
      .from('staff_profiles')
      .insert({
        establishment_id: establishmentId,
        user_id: userAId,
        full_name: 'Staff A',
        onboarding_status: 'complete',
        stripe_account_id: 'acct_test_a',
      })
      .select('id')
      .single();
    staffAId = sA!.id;

    const { data: sB } = await serviceClient
      .from('staff_profiles')
      .insert({
        establishment_id: establishmentId,
        user_id: userBId,
        full_name: 'Staff B',
        onboarding_status: 'complete',
        stripe_account_id: 'acct_test_b',
      })
      .select('id')
      .single();
    staffBId = sB!.id;

    // Add staff roles
    await serviceClient.from('user_roles').insert([
      { user_id: userAId, role: 'staff', establishment_id: establishmentId },
      { user_id: userBId, role: 'staff', establishment_id: establishmentId },
    ]);

    // Create one transaction for each staff member (service role only — as per design)
    const { data: txA } = await serviceClient
      .from('transactions')
      .insert({
        amount: 500,
        currency: 'EUR',
        staff_id: staffAId,
        establishment_id: establishmentId,
        status: 'succeeded',
        idempotency_key: `test-txn-a-${ts}`,
      })
      .select('id')
      .single();
    transactionAId = txA!.id;

    const { data: txB } = await serviceClient
      .from('transactions')
      .insert({
        amount: 1000,
        currency: 'EUR',
        staff_id: staffBId,
        establishment_id: establishmentId,
        status: 'succeeded',
        idempotency_key: `test-txn-b-${ts}`,
      })
      .select('id')
      .single();
    transactionBId = txB!.id;
  });

  afterAll(async () => {
    await serviceClient.from('transactions').delete().in('id', [transactionAId, transactionBId]);
    await serviceClient.from('staff_profiles').delete().in('id', [staffAId, staffBId]);
    await serviceClient.from('establishments').delete().eq('id', establishmentId);
    await serviceClient.from('groups').delete().eq('id', groupId);
    for (const uid of [userAId, userBId]) {
      if (uid) await serviceClient.auth.admin.deleteUser(uid);
    }
  });

  it('Staff A can see their own transaction', async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    await client.auth.signInWithPassword({
      email: `staff-a-${Date.now()}@test.local`,
      password: 'test-staff-password',
    });
    const { data } = await client
      .from('transactions')
      .select('id')
      .eq('id', transactionAId);
    expect(data).toHaveLength(1);
  });

  it('Staff A cannot see Staff B transaction', async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    await client.auth.signInWithPassword({
      email: `staff-a-${Date.now()}@test.local`,
      password: 'test-staff-password',
    });
    const { data } = await client
      .from('transactions')
      .select('id')
      .eq('id', transactionBId);
    expect(data).toHaveLength(0);
  });

  it('Staff B cannot see Staff A transaction', async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    await client.auth.signInWithPassword({
      email: `staff-b-${Date.now()}@test.local`,
      password: 'test-staff-password',
    });
    const { data } = await client
      .from('transactions')
      .select('id')
      .eq('id', transactionAId);
    expect(data).toHaveLength(0);
  });

  it('Authenticated users cannot INSERT transactions directly', async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    await client.auth.signInWithPassword({
      email: `staff-a-${Date.now()}@test.local`,
      password: 'test-staff-password',
    });
    const { error } = await client.from('transactions').insert({
      amount: 999,
      currency: 'EUR',
      staff_id: staffAId,
      establishment_id: establishmentId,
      status: 'pending',
      idempotency_key: `rls-test-direct-insert-${Date.now()}`,
    });
    expect(error).not.toBeNull(); // RLS should block this
  });
});
