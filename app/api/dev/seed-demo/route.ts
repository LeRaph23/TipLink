import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

// Dev-only route: seeds a fully-populated "paid" account in Supabase so you
// can log in and exercise the whole dashboard without running the real
// onboarding + Stripe checkout flow.
//
// Guarded behind NODE_ENV !== 'production' AND an explicit env flag so it
// can never leak on a prod deployment even if someone flips NODE_ENV.
export const runtime = 'nodejs';

const DEMO_EMAIL = 'demo@tiplink.dev';
const DEMO_PASSWORD = 'demo1234!';

function isDevEnabled() {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.DISABLE_DEMO_SEED === '1') return false;
  return true;
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const anyE = e as Record<string, unknown>;
    return (
      (typeof anyE.message === 'string' && anyE.message) ||
      (typeof anyE.error_description === 'string' && anyE.error_description) ||
      (typeof anyE.error === 'string' && anyE.error) ||
      (typeof anyE.hint === 'string' && anyE.hint) ||
      (typeof anyE.details === 'string' && anyE.details) ||
      JSON.stringify(e)
    );
  }
  if (typeof e === 'string') return e;
  return 'unknown';
}

function randomShortId(len = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function POST() {
  if (!isDevEnabled()) {
    return NextResponse.json({ error: 'disabled' }, { status: 404 });
  }

  // Surface missing env early with a clear message.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_SUPABASE_URL is not set' }, { status: 500 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 500 });
  }

  const admin = createServiceClient();
  let step = 'init';
  const fail = (e: unknown): never => {
    throw new Error(`[${step}] ${toMessage(e)}`);
  };

  try {
    step = 'auth.listUsers';
    let userId: string | null = null;
    {
      const { data: list, error } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (error) fail(error);
      const existing = list!.users.find((u) => u.email === DEMO_EMAIL);
      if (existing) userId = existing.id;
    }

    if (!userId) {
      step = 'auth.createUser';
      const { data, error } = await admin.auth.admin.createUser({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: 'Demo Manager' },
      });
      if (error) fail(error);
      userId = data!.user!.id;
    } else {
      step = 'auth.updateUserById';
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password: DEMO_PASSWORD,
        email_confirm: true,
      });
      if (error) fail(error);
    }

    step = 'groups.select';
    const groupName = 'Demo Bistro';
    let groupId: string;

    // The billing columns come from migration 00006_billing_fields.sql. If the
    // migration has not been pushed yet we still want the seed to work, so we
    // start with the minimum required fields and best-effort patch the rest
    // afterwards.
    const corePatch: Record<string, unknown> = {
      settings: { tip_thresholds: [2, 5, 10, 20], default_currency: 'EUR' },
      platform_fee_bps: 300,
    };
    const billingPatch: Record<string, unknown> = {
      subscription_status: 'active',
      subscription_pack: 'm',
      stripe_customer_id: 'cus_demo',
      subscription_id: 'sub_demo',
      legal_name: 'Demo Bistro SARL',
      vat_number: 'FR12345678901',
      platform_fee_bps: 300,
    };

    {
      const { data: existing, error } = await admin
        .from('groups')
        .select('id')
        .eq('name', groupName)
        .maybeSingle();
      if (error) fail(error);
      if (existing) {
        groupId = existing.id;
      } else {
        step = 'groups.insert';
        const { data, error: insErr } = await admin
          .from('groups')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ name: groupName, ...corePatch } as any)
          .select('id')
          .single();
        if (insErr) fail(insErr);
        groupId = data!.id;
      }
    }

    // Best-effort billing patch — tolerant to missing columns (migration not pushed).
    step = 'groups.update(billing)';
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upErr } = await admin.from('groups').update(billingPatch as any).eq('id', groupId);
      if (upErr) {
        console.warn('[seed-demo] billing patch skipped:', toMessage(upErr));
      }
    }

    // The unique index on user_roles uses COALESCE expressions on nullable
    // columns, so it cannot be used as an ON CONFLICT target. We do a manual
    // check-then-insert instead.
    step = 'user_roles.select';
    {
      const { data: existingRole, error: selErr } = await admin
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .eq('role', 'group_admin')
        .eq('group_id', groupId)
        .maybeSingle();
      if (selErr) fail(selErr);
      if (!existingRole) {
        step = 'user_roles.insert';
        const { error: insErr } = await admin.from('user_roles').insert({
          user_id: userId,
          role: 'group_admin',
          group_id: groupId,
          establishment_id: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        if (insErr) fail(insErr);
      }
    }

    step = 'establishments.select';
    const estSlug = `demo-bistro-${groupId.slice(0, 8)}`;
    let establishmentId: string;
    {
      const { data: existing, error } = await admin
        .from('establishments')
        .select('id')
        .eq('group_id', groupId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) fail(error);
      if (existing) {
        establishmentId = existing.id;
      } else {
        step = 'establishments.insert';
        const { data, error: insErr } = await admin
          .from('establishments')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({
            group_id: groupId,
            name: 'Demo Bistro — Paris 11e',
            business_type: 'restaurant',
            slug: estSlug,
            stripe_account_id: 'acct_demo_establishment',
            country: 'FR',
            currency: 'EUR',
            onboarding_status: 'complete',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any)
          .select('id')
          .single();
        if (insErr) fail(insErr);
        establishmentId = data!.id;
      }
    }

    // 5. Staff members.
    const staffSeed = [
      { full_name: 'Alice Martin', onboarding_status: 'complete' as const, ready: true },
      { full_name: 'Benoît Moreau', onboarding_status: 'complete' as const, ready: true },
      { full_name: 'Clara Dubois', onboarding_status: 'complete' as const, ready: true },
      { full_name: 'David Laurent', onboarding_status: 'pending' as const, ready: false },
    ];

    const { data: existingStaff } = await admin
      .from('staff_profiles')
      .select('id, full_name')
      .eq('establishment_id', establishmentId)
      .is('deleted_at', null);

    const staffIds: string[] = [];
    for (const s of staffSeed) {
      const match = existingStaff?.find((e) => e.full_name === s.full_name);
      if (match) {
        staffIds.push(match.id);
        continue;
      }
      step = `staff_profiles.insert(${s.full_name})`;
      const { data, error } = await admin
        .from('staff_profiles')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          establishment_id: establishmentId,
          full_name: s.full_name,
          stripe_account_id: s.ready ? `acct_demo_${s.full_name.replace(/\s+/g, '_').toLowerCase()}` : null,
          onboarding_status: s.onboarding_status,
          is_active: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select('id')
        .single();
      if (error) fail(error);
      staffIds.push(data!.id);
    }

    // 6. NFC stickers — a couple of establishment-scoped tags.
    //    Since the product model pivoted to establishment-only, we seed
    //    enough tags that the demo has something to show but never
    //    attach them to a specific staff member.
    const { count: stickerCount } = await admin
      .from('nfc_stickers')
      .select('id', { count: 'exact', head: true })
      .eq('establishment_id', establishmentId);

    const readyStaffIds = staffIds.slice(0, 3);
    const missing = Math.max(0, 2 - (stickerCount ?? 0));
    for (let i = 0; i < missing; i++) {
      step = `nfc_stickers.insert(${i})`;
      const { error } = await admin.from('nfc_stickers').insert({
        short_id: randomShortId(),
        establishment_id: establishmentId,
      });
      if (error) fail(error);
    }

    // 7. Transactions — sprinkle across last 30 days.
    const { count: txCount } = await admin
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('establishment_id', establishmentId);

    if ((txCount ?? 0) < 20) {
      step = 'transactions.insert';
      const amounts = [200, 200, 300, 500, 500, 500, 500, 1000, 1000, 2000];
      const rows = Array.from({ length: 40 }).map((_, i) => {
        const daysAgo = Math.floor(Math.random() * 30);
        const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - Math.random() * 86_400_000);
        const status = Math.random() < 0.92 ? 'succeeded' : Math.random() < 0.5 ? 'pending' : 'failed';
        return {
          amount: rand(amounts),
          currency: 'EUR',
          staff_id: rand(readyStaffIds),
          establishment_id: establishmentId,
          stripe_payment_intent_id: `pi_demo_${i}_${Math.random().toString(36).slice(2, 8)}`,
          status,
          metadata: { source: 'demo_seed', table_number: String(Math.ceil(Math.random() * 12)) },
          idempotency_key: `demo_${groupId}_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          created_at: d.toISOString(),
        };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await admin.from('transactions').insert(rows as any);
      if (error) fail(error);
    }

    // 8. A fulfilled smarttag order. Tolerant if migrations 00007/00012 are
    // not applied yet — we just skip this step and log a warning.
    step = 'smarttag_orders.select';
    {
      const { data: existingOrder, error: selErr } = await admin
        .from('smarttag_orders')
        .select('id')
        .eq('group_id', groupId)
        .maybeSingle();

      if (selErr) {
        console.warn('[seed-demo] smarttag_orders skipped:', toMessage(selErr));
      } else if (!existingOrder) {
        step = 'smarttag_orders.insert';
        const coreRow: Record<string, unknown> = {
          group_id: groupId,
          pack: 'm',
          quantity: 30,
          stripe_checkout_session_id: `cs_demo_${groupId.slice(0, 8)}`,
          stripe_invoice_id: `in_demo_${groupId.slice(0, 8)}`,
          status: 'shipped',
          shipping_address: {
            name: 'Demo Bistro',
            street: '12 rue de la Demo',
            city: 'Paris',
            postal_code: '75011',
            country: 'FR',
          },
          tracking_number: 'DEMO123456789FR',
          shipped_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        };
        // First try the full row (migration 00012 applied).
        const fullRow = {
          ...coreRow,
          tags_encoded_count: 30,
          fulfilled_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let { error } = await admin.from('smarttag_orders').insert(fullRow as any);
        if (error) {
          console.warn('[seed-demo] falling back to core smarttag_orders columns:', toMessage(error));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const retry = await admin.from('smarttag_orders').insert(coreRow as any);
          error = retry.error;
        }
        if (error) {
          console.warn('[seed-demo] smarttag_orders insert skipped:', toMessage(error));
        }
      }
    }

    return NextResponse.json({
      ok: true,
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      group_id: groupId,
      establishment_id: establishmentId,
    });
  } catch (e) {
    console.error('[seed-demo] step=', step, e);
    const message = toMessage(e);
    return NextResponse.json({ error: message, step }, { status: 500 });
  }
}
