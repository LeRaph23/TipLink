/**
 * RLS — user_roles isolation.
 *
 * Verifies a regular user cannot read another user's roles, and cannot grant
 * themselves a super_admin role.
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
    await service.from('user_roles').insert({ user_id: userBId, role: 'group_admin', group_id: groupId });
  });

  afterAll(async () => {
    await service.from('user_roles').delete().in('user_id', [userAId, userBId]);
    await service.from('groups').delete().eq('id', groupId);
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

  it('user A cannot read user B roles', async () => {
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
