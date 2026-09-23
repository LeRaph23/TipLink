/**
 * RLS — user_roles isolation.
 *
 * Verifies a regular user cannot read the roles of a user in ANOTHER tenant,
 * and cannot grant themselves a super_admin role.
 *
 * The cross-tenant part is the whole point. `user_roles_select_own` deliberately
 * allows `group_id = ANY(get_my_group_ids())`, so a group_admin CAN see the
 * roles attached to their own group — the team management screens need exactly
 * that. This test used to put both users in the same group and then assert they
 * could not see each other, which asserted the opposite of the intended design;
 * it had never run to say so.
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

describe.skipIf(skipIfNoLocal)('user_roles RLS isolation', () => {
  const service = skipIfNoLocal
    ? (null as unknown as ReturnType<typeof createClient>)
    : createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

  let groupId: string;
  let groupBId: string;
  let userAEmail: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    const { data: group } = await service
      .from('groups')
      .insert({ name: 'Roles RLS Group', settings: {} })
      .select('id')
      .single();
    groupId = group!.id;

    // A separate tenant. Same group would make user B a legitimate peer.
    const { data: groupB } = await service
      .from('groups')
      .insert({ name: 'Roles RLS Group B', settings: {} })
      .select('id')
      .single();
    groupBId = groupB!.id;

    userAEmail = `roles-rls-a-${Date.now()}@test.local`;
    const { data: a } = await service.auth.admin.createUser({
      email: userAEmail,
      password: 'test-password-rls-123',
      email_confirm: true,
    });
    userAId = a.user!.id;
    await service.from('user_roles').insert({ user_id: userAId, role: 'group_admin', group_id: groupId });

    const { data: b } = await service.auth.admin.createUser({
      email: `roles-rls-b-${Date.now()}@test.local`,
      password: 'test-password-rls-123',
      email_confirm: true,
    });
    userBId = b.user!.id;
    await service.from('user_roles').insert({ user_id: userBId, role: 'group_admin', group_id: groupBId });
  });

  afterAll(async () => {
    await service.from('user_roles').delete().in('user_id', [userAId, userBId]);
    await service.from('groups').delete().in('id', [groupId, groupBId]);
    if (userAId) await service.auth.admin.deleteUser(userAId);
    if (userBId) await service.auth.admin.deleteUser(userBId);
  });

  async function clientAsUserA() {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await client.auth.signInWithPassword({
      email: userAEmail,
      password: 'test-password-rls-123',
    });
    if (error) throw new Error(`signIn failed: ${error.message}`);
    return client;
  }

  it('user A cannot read the roles of a user in another group', async () => {
    const client = await clientAsUserA();
    const { data } = await client.from('user_roles').select('id').eq('user_id', userBId);
    expect(data ?? []).toHaveLength(0);
  });

  it('user A cannot self-grant a super_admin role', async () => {
    const client = await clientAsUserA();
    const { error } = await client.from('user_roles').insert({
      user_id: userAId,
      role: 'super_admin',
    });
    expect(error).not.toBeNull();
    // Verify with the service role that no super_admin row was created.
    const { data } = await service
      .from('user_roles')
      .select('id')
      .eq('user_id', userAId)
      .eq('role', 'super_admin');
    expect(data ?? []).toHaveLength(0);
  });
});
