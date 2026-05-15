/**
 * RLS — transactions isolation.
 *
 * Verifies a group_admin can only SELECT transactions belonging to their own
 * establishments, never another group's.
 *
 * Prerequisites:
 *   - Run: npx supabase start
 *   - Set SUPABASE_LOCAL_SERVICE_KEY and SUPABASE_LOCAL_ANON_KEY env vars
 *
 * Run: npm run test:rls
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://localhost:54321';
const SERVICE_KEY = process.env.SUPABASE_LOCAL_SERVICE_KEY ?? '';
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY ?? '';

const skipIfNoLocal = !SERVICE_KEY || !ANON_KEY;

describe.skipIf(skipIfNoLocal)('transactions RLS isolation', () => {
  const service = skipIfNoLocal
    ? (null as unknown as ReturnType<typeof createClient>)
    : createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

  let groupAId: string;
  let groupBId: string;
  let estAId: string;
  let estBId: string;
  let txnBId: string;
  let txnAId: string;
  let adminAEmail: string;
  let adminAUserId: string;

  beforeAll(async () => {
    const { data: gA } = await service.from('groups').insert({ name: 'Txn Group A', settings: {} }).select('id').single();
    groupAId = gA!.id;
    const { data: gB } = await service.from('groups').insert({ name: 'Txn Group B', settings: {} }).select('id').single();
    groupBId = gB!.id;

    const mkEst = async (groupId: string, label: string) => {
      const { data } = await service
        .from('establishments')
        .insert({
          group_id: groupId,
          name: label,
          business_type: 'beauty',
          slug: `txn-rls-${label}-${Date.now()}`,
          country: 'FR',
          currency: 'EUR',
        })
        .select('id')
        .single();
      return data!.id as string;
    };
    estAId = await mkEst(groupAId, 'a');
    estBId = await mkEst(groupBId, 'b');

    const mkTxn = async (estId: string) => {
      const { data } = await service
        .from('transactions')
        .insert({
          amount: 500,
          currency: 'EUR',
          establishment_id: estId,
          status: 'succeeded',
          idempotency_key: `txn-rls-${estId}-${Date.now()}-${Math.random()}`,
        })
        .select('id')
        .single();
      return data!.id as string;
    };
    txnAId = await mkTxn(estAId);
    txnBId = await mkTxn(estBId);

    adminAEmail = `txn-rls-admin-${Date.now()}@test.local`;
    const { data: { user } } = await service.auth.admin.createUser({
      email: adminAEmail,
      password: 'test-password-rls-123',
      email_confirm: true,
    });
    adminAUserId = user!.id;
    await service.from('user_roles').insert({
      user_id: adminAUserId,
      role: 'group_admin',
      group_id: groupAId,
    });
  });

  afterAll(async () => {
    await service.from('transactions').delete().in('id', [txnAId, txnBId]);
    await service.from('establishments').delete().in('id', [estAId, estBId]);
    await service.from('groups').delete().in('id', [groupAId, groupBId]);
    if (adminAUserId) await service.auth.admin.deleteUser(adminAUserId);
  });

  async function clientAsAdminA() {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await client.auth.signInWithPassword({
      email: adminAEmail,
      password: 'test-password-rls-123',
    });
    if (error) throw new Error(`signIn failed: ${error.message}`);
    return client;
  }

  it('Group A admin cannot SELECT Group B transactions', async () => {
    const client = await clientAsAdminA();
    const { data } = await client.from('transactions').select('id').eq('id', txnBId);
    expect(data ?? []).toHaveLength(0);
  });

  it('Group A admin can SELECT their own transactions', async () => {
    const client = await clientAsAdminA();
    const { data } = await client.from('transactions').select('id').eq('id', txnAId);
    expect(data ?? []).toHaveLength(1);
  });
});
