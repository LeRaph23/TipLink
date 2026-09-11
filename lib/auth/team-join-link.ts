import 'server-only';
import type { createServiceClient } from '@/lib/supabase/service';
import { getBaseUrl } from '@/lib/env';
import { signTeamJoinToken } from '@/lib/auth/team-join-token';

type Service = ReturnType<typeof createServiceClient>;

/**
 * Server-side helpers around the signed team-join link.
 *
 * Kept apart from lib/auth/team-join-token so that the token itself stays pure
 * and dependency-free, and can be unit-tested without a database.
 */

/** Query parameter carrying the signed token. Short, because it ends up in a QR. */
export const TEAM_TOKEN_PARAM = 't';

/**
 * Current `team_join_version` for an establishment, defaulting to the column's
 * own DEFAULT when it cannot be read.
 *
 * Read tolerantly on purpose: Supabase migrations are pushed independently of
 * the app, and selecting a column that does not exist yet fails the whole
 * query. Folding this into the establishment lookup would turn "migration
 * 00079 has not landed" into "no such establishment", i.e. nobody can join at
 * all.
 *
 * Falling back to 1 is safe rather than permissive: a token still has to carry
 * a valid signature naming this establishment, and still has to be unexpired.
 * The only thing unavailable before the migration is rotation.
 */
export async function readTeamJoinVersion(
  service: Service,
  establishmentId: string,
): Promise<number> {
  const { data, error } = await service
    .from('establishments')
    .select('team_join_version')
    .eq('id', establishmentId)
    .maybeSingle();
  if (error) return 1;
  const version = (data as { team_join_version?: number } | null)?.team_join_version;
  return typeof version === 'number' ? version : 1;
}

/** Absolute, shareable join URL for an establishment, at its current version. */
export async function buildTeamJoinUrl(
  service: Service,
  establishmentId: string,
  locale: string,
): Promise<string> {
  const version = await readTeamJoinVersion(service, establishmentId);
  const token = signTeamJoinToken(establishmentId, version);
  return `${getBaseUrl()}/${locale}/join/${establishmentId}?${TEAM_TOKEN_PARAM}=${encodeURIComponent(token)}`;
}

/**
 * Invalidates every outstanding team link for an establishment by bumping the
 * version the tokens are signed against, and returns the fresh URL.
 *
 * Returns null when the column is missing (migration not yet applied), so the
 * caller can say so rather than reporting a rotation that did not happen.
 */
export async function rotateTeamJoinLink(
  service: Service,
  establishmentId: string,
  locale: string,
): Promise<string | null> {
  const current = await readTeamJoinVersion(service, establishmentId);
  const { error } = await service
    .from('establishments')
    .update({ team_join_version: current + 1 } as never)
    .eq('id', establishmentId);
  if (error) return null;
  const token = signTeamJoinToken(establishmentId, current + 1);
  return `${getBaseUrl()}/${locale}/join/${establishmentId}?${TEAM_TOKEN_PARAM}=${encodeURIComponent(token)}`;
}
