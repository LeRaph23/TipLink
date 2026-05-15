/**
 * RLS — promo_codes is super-admin only.
 *
 * Verifies that a non-super-admin user cannot SELECT, INSERT, UPDATE or DELETE
 * promo codes. Only the service role (used by webhooks/server actions) and
 * super-admins may touch the table.
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

describe.skipIf(skipIfNoLocal)('promo_codes RLS (super-admin only)', () => {
  const service = skipIfNoLocal
    ? (null as unknown as ReturnType<typeof createClient>)
    : createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

  let groupAdminEmail: string;
  let groupAdminUserId: string;
  let groupId: string;
  let promoId: string;

  beforeAll(async () => {
    const { data: group } = await service
      .from('groups')
      .insert({ name: 'Promo RLS Group', settings: {} })
      .select('id')
      .single();
    groupId = group!.id;

    groupAdminEmail = `rls-promo-${Date.now()}@test.local`;
    const { data: { user } } = await service.auth.admin.createUser({
      email: groupAdminEmail,
      password: 'test-password-rls-123',
      email_confirm: true,
    });
    groupAdminUserId = user!.id;
    await service.from('user_roles').insert({
      user_id: groupAdminUserId,
      role: 'group_admin',
      group_id: groupId,
    });

    const { data: promo } = await service
      .from('promo_codes')
      .insert({
        code: `RLSTEST${Date.now()}`,
        stripe_coupon_id: 'coupon_rls_test',
        stripe_promo_code_id: `promo_rls_${Date.now()}`,
        percentage_off: 10,
      })
      .select('id')
      .single();
    promoId = promo!.id;
  });

  afterAll(async () => {
    await service.from('promo_codes').delete().eq('id', promoId);
    await service.from('groups').delete().eq('id', groupId);
    if (groupAdminUserId) await service.auth.admin.deleteUser(groupAdminUserId);
  });

  async function clientAsGroupAdmin() {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await client.auth.signInWithPassword({
      email: groupAdminEmail,
      password: 'test-password-rls-123',
    });
    if (error) throw new Error(`signIn failed: ${error.message}`);
    return client;
  }

  it('non-super-admin cannot SELECT promo codes', async () => {
    const client = await clientAsGroupAdmin();
    const { data } = await client.from('promo_codes').select('id').eq('id', promoId);
    expect(data ?? []).toHaveLength(0);
  });

  it('non-super-admin cannot INSERT a promo code', async () => {
    const client = await clientAsGroupAdmin();
    const { error } = await client.from('promo_codes').insert({
      code: `EVIL${Date.now()}`,
      stripe_coupon_id: 'x',
      stripe_promo_code_id: `x_${Date.now()}`,
      percentage_off: 100,
    });
    expect(error).not.toBeNull();
  });

  it('non-super-admin cannot UPDATE a promo code', async () => {
    const client = await clientAsGroupAdmin();
    const { data } = await client
      .from('promo_codes')
      .update({ percentage_off: 99 })
      .eq('id', promoId)
      .select('id');
    expect(data ?? []).toHaveLength(0);
  });

  it('non-super-admin cannot DELETE a promo code', async () => {
    const client = await clientAsGroupAdmin();
    await client.from('promo_codes').delete().eq('id', promoId);
    // The row must still exist (verified with the service role).
    const { data } = await service.from('promo_codes').select('id').eq('id', promoId);
    expect(data ?? []).toHaveLength(1);
  });
});
