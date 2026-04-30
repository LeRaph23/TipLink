import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type AdminSearchResult = {
  groups: { id: string; name: string }[];
  establishments: { id: string; name: string; slug: string }[];
  staff: { id: string; full_name: string; establishment_id: string }[];
  stickers: { id: string; short_id: string; establishment_id: string | null }[];
  transactions: { id: string; stripe_payment_intent_id: string | null; amount: number; created_at: string }[];
};

const LIMIT = 15;

function likePattern(term: string): string {
  const safe = term.replace(/%/g, '\\%').replace(/_/g, '\\_');
  return `%${safe}%`;
}

export async function runAdminSearch(
  supabase: SupabaseClient<Database>,
  raw: string
): Promise<AdminSearchResult> {
  const q = raw.trim();
  if (!q) {
    return { groups: [], establishments: [], staff: [], stickers: [], transactions: [] };
  }

  const like = likePattern(q);
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q);

  const [groups, establishments, staff, stickers] = await Promise.all([
    supabase.from('groups').select('id, name').is('deleted_at', null).ilike('name', like).limit(LIMIT),
    supabase.from('establishments').select('id, name, slug').is('deleted_at', null).ilike('name', like).limit(LIMIT),
    supabase.from('staff_profiles').select('id, full_name, establishment_id').is('deleted_at', null).ilike('full_name', like).limit(LIMIT),
    supabase.from('nfc_stickers').select('id, short_id, establishment_id').ilike('short_id', like).limit(LIMIT),
  ]);

  let transactions: AdminSearchResult['transactions'] = [];
  if (isUuid) {
    const [byId, byPi] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, stripe_payment_intent_id, amount, created_at')
        .eq('id', q)
        .limit(LIMIT),
      supabase
        .from('transactions')
        .select('id, stripe_payment_intent_id, amount, created_at')
        .eq('stripe_payment_intent_id', q)
        .limit(LIMIT),
    ]);
    const map = new Map<string, (typeof transactions)[0]>();
    for (const row of [...(byId.data ?? []), ...(byPi.data ?? [])]) {
      map.set(row.id, row);
    }
    transactions = [...map.values()].slice(0, LIMIT);
  } else {
    const { data } = await supabase
      .from('transactions')
      .select('id, stripe_payment_intent_id, amount, created_at')
      .ilike('stripe_payment_intent_id', like)
      .limit(LIMIT);
    transactions = data ?? [];
  }

  return {
    groups: groups.data ?? [],
    establishments: establishments.data ?? [],
    staff: staff.data ?? [],
    stickers: stickers.data ?? [],
    transactions,
  };
}
