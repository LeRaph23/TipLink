/**
 * RLS Sticker Tests — establishment-only model
 *
 * SmartTags are provisioned exclusively by the TipLink super_admin
 * (manually, via backoffice). Managers/group_admins must not be able
 * to INSERT, UPDATE or DELETE nfc_stickers rows; they can only SELECT
 * the tags attached to their own establishments.
 *
 * Prerequisites: npx supabase start
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://localhost:54321';
const SERVICE_KEY = process.env.SUPABASE_LOCAL_SERVICE_KEY ?? '';
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY ?? '';

const skipIfNoLocal = !SERVICE_KEY || !ANON_KEY;

describe.skipIf(skipIfNoLocal)('Sticker RLS (establishment-only)', () => {
  const serviceClient = skipIfNoLocal
    ? (null as unknown as ReturnType<typeof createClient>)
    : createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

  let groupId: string;
  let establishmentAId: string;
  let establishmentBId: string;
  let managerAEmail: string;
  let managerAUserId: string;
  let stickerAId: string;
  let stickerBId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const { data: group } = await serviceClient
      .from('groups')
      .insert({ name: `Sticker Test Group ${ts}`, settings: {} })
      .select('id')
      .single();
    groupId = group!.id;

    const { data: estA } = await serviceClient
      .from('establishments')
      .insert({
        group_id: groupId,
        name: 'Establishment A',
        business_type: 'restaurant',
        slug: `sticker-est-a-${ts}`,
        country: 'FR',
        currency: 'EUR',
      })
      .select('id')
      .single();
    establishmentAId = estA!.id;

    const { data: estB } = await serviceClient
      .from('establishments')
      .insert({
        group_id: groupId,
        name: 'Establishment B',
        business_type: 'restaurant',
        slug: `sticker-est-b-${ts}`,
        country: 'FR',
        currency: 'EUR',
      })
      .select('id')
      .single();
    establishmentBId = estB!.id;

    managerAEmail = `mgr-a-${ts}@test.local`;
    const { data: { user } } = await serviceClient.auth.admin.createUser({
      email: managerAEmail,
      password: 'test-manager-password',
      email_confirm: true,
    });
    managerAUserId = user!.id;

    await serviceClient.from('user_roles').insert({
      user_id: managerAUserId,
      role: 'manager',
      establishment_id: establishmentAId,
    });

    const { data: stickerA } = await serviceClient
      .from('nfc_stickers')
      .insert({ short_id: `shortA-${ts}`, establishment_id: establishmentAId })
      .select('id')
      .single();
    stickerAId = stickerA!.id;

    const { data: stickerB } = await serviceClient
      .from('nfc_stickers')
      .insert({ short_id: `shortB-${ts}`, establishment_id: establishmentBId })
      .select('id')
      .single();
    stickerBId = stickerB!.id;
  });

  afterAll(async () => {
    await serviceClient.from('nfc_stickers').delete().in('id', [stickerAId, stickerBId]);
    await serviceClient
      .from('establishments')
      .delete()
      .in('id', [establishmentAId, establishmentBId]);
    await serviceClient.from('groups').delete().eq('id', groupId);
    if (managerAUserId) await serviceClient.auth.admin.deleteUser(managerAUserId);
  });

  it('Manager A can SELECT only their own establishment stickers', async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    await client.auth.signInWithPassword({
      email: managerAEmail,
      password: 'test-manager-password',
    });

    const { data, error } = await client
      .from('nfc_stickers')
      .select('id, establishment_id');

    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(stickerAId);
    expect(ids).not.toContain(stickerBId);
  });

  it('Manager A CANNOT INSERT a sticker into their own establishment', async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    await client.auth.signInWithPassword({
      email: managerAEmail,
      password: 'test-manager-password',
    });

    const { data, error } = await client
      .from('nfc_stickers')
      .insert({ short_id: `mgrInsert-${Date.now()}`, establishment_id: establishmentAId })
      .select('id');

    const rejected = !!error || !data || data.length === 0;
    expect(rejected).toBe(true);
  });

  it('Manager A CANNOT UPDATE their own sticker', async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    await client.auth.signInWithPassword({
      email: managerAEmail,
      password: 'test-manager-password',
    });

    const newShort = `mgrUpdate-${Date.now()}`;
    const { data, error } = await client
      .from('nfc_stickers')
      .update({ short_id: newShort })
      .eq('id', stickerAId)
      .select('id');

    const rejected = !!error || !data || data.length === 0;
    expect(rejected).toBe(true);

    const { data: after } = await serviceClient
      .from('nfc_stickers')
      .select('short_id')
      .eq('id', stickerAId)
      .single();
    expect(after!.short_id).not.toBe(newShort);
  });

  it('Manager A CANNOT DELETE their own sticker', async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    await client.auth.signInWithPassword({
      email: managerAEmail,
      password: 'test-manager-password',
    });

    const { error } = await client
      .from('nfc_stickers')
      .delete()
      .eq('id', stickerAId);

    const { data: after } = await serviceClient
      .from('nfc_stickers')
      .select('id')
      .eq('id', stickerAId)
      .single();
    // Either the delete raised an error, or it silently matched nothing — row stays.
    expect(after?.id).toBe(stickerAId);
    // error can be null (silent no-op) or non-null, both are acceptable.
    void error;
  });
});
