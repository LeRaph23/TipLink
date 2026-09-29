import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveGroupAdmin, type GroupAdminRecipient } from '@/lib/email/lifecycle';

export type PendingActivation = { groupId: string; recipient: GroupAdminRecipient | null };

/**
 * A scanned tag that belongs to an establishment whose group has not finished
 * onboarding: a plaque bought online, shipped before its owner set up his
 * account. Returns the group and the buyer's email (the account's, or the
 * Stripe customer's for a buyer who never created one), or null when the tag
 * is unknown, in stock, or already activated.
 */
export async function findPendingActivation(
  service: SupabaseClient,
  tag: string,
): Promise<PendingActivation | null> {
  const { data } = await service.rpc('resolve_sticker_establishment', { p_short_id: tag });
  const row = Array.isArray(data) ? (data[0] as { establishment_id: string | null; group_id?: string | null; group_onboarded?: boolean | null } | undefined) : undefined;
  if (!row?.establishment_id || !row.group_id || row.group_onboarded !== false) return null;
  const recipient = await resolveGroupAdmin(service, row.group_id);
  return { groupId: row.group_id, recipient };
}
