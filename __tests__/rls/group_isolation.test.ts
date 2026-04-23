/**
 * RLS Group Isolation Tests
 *
 * Verifies that a group_admin for Group A cannot SELECT data belonging to Group B.
 *
 * Prerequisites:
 *   - Run: npx supabase start
 *   - Set SUPABASE_LOCAL_URL and SUPABASE_LOCAL_SERVICE_KEY env vars
 *
 * Run: npm run test:rls
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://localhost:54321';
const SERVICE_KEY = process.env.SUPABASE_LOCAL_SERVICE_KEY ?? '';
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY ?? '';

// Skip entire suite if local Supabase is not configured
const skipIfNoLocal = !SERVICE_KEY || !ANON_KEY;

describe.skipIf(skipIfNoLocal)('Group RLS Isolation', () => {
  // Lazy-init inside describe so module-level evaluation doesn't crash when keys are absent
  const serviceClient = skipIfNoLocal
    ? (null as unknown as ReturnType<typeof createClient>)
    : createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

  let groupAId: string;
  let groupBId: string;
  let establishmentBId: string;
  let adminAUserId: string;
  let adminAEmail: string;

  beforeAll(async () => {
    const { data: groupA } = await serviceClient
      .from('groups')
      .insert({ name: 'Test Group A', settings: {} })
      .select('id')
      .single();
    groupAId = groupA!.id;

    const { data: groupB } = await serviceClient
      .from('groups')
      .insert({ name: 'Test Group B', settings: {} })
      .select('id')
      .single();
    groupBId = groupB!.id;

    const { data: estB } = await serviceClient
      .from('establishments')
      .insert({
        group_id: groupBId,
        name: 'Restaurant B (RLS Test)',
        business_type: 'restaurant',
        slug: `rls-test-rest-b-${Date.now()}`,
        country: 'FR',
        currency: 'EUR',
      })
      .select('id')
      .single();
    establishmentBId = estB!.id;

    adminAEmail = `rls-admin-a-${Date.now()}@test.local`;
    const { data: { user } } = await serviceClient.auth.admin.createUser({
      email: adminAEmail,
      password: 'test-password-rls-123',
      email_confirm: true,
    });
    adminAUserId = user!.id;

    await serviceClient.from('user_roles').insert({
      user_id: adminAUserId,
      role: 'group_admin',
      group_id: groupAId,
    });
  });

  afterAll(async () => {
    await serviceClient.from('establishments').delete().eq('id', establishmentBId);
    await serviceClient.from('groups').delete().in('id', [groupAId, groupBId]);
    if (adminAUserId) {
      await serviceClient.auth.admin.deleteUser(adminAUserId);
    }
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

  it('Group A admin cannot SELECT Group B establishments', async () => {
    const client = await clientAsAdminA();
    const { data } = await client
      .from('establishments')
      .select('id')
      .eq('id', establishmentBId);
    expect(data).toHaveLength(0);
  });

  it('Group A admin cannot SELECT Group B in groups table', async () => {
    const client = await clientAsAdminA();
    const { data } = await client
      .from('groups')
      .select('id')
      .eq('id', groupBId);
    expect(data).toHaveLength(0);
  });

  it('Group A admin can SELECT their own group', async () => {
    const client = await clientAsAdminA();
    const { data } = await client
      .from('groups')
      .select('id')
      .eq('id', groupAId);
    expect(data).toHaveLength(1);
  });
});
