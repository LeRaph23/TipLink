import 'server-only';
import type { createServiceClient } from '@/lib/supabase/service';

type ServiceClient = ReturnType<typeof createServiceClient>;

// Slugify a name into the canonical form used for `establishments.slug`:
// lowercase, accents stripped, non-alphanumerics collapsed to single hyphens,
// trimmed, capped at 80 chars.
export function slugifyEstablishmentName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

// `establishments.slug` is UNIQUE. Two establishments whose names map to the
// same slug — a duplicate name, or a salon retrying onboarding after the Stripe
// webhook already provisioned a name-based slug — would otherwise violate
// `establishments_slug_key` and surface a raw Postgres error (or, in the
// webhook, silently fail to provision an establishment the customer paid for).
//
// This derives a base slug from the name and appends a short random suffix
// until it's free, ignoring the row being updated (excludeId) so re-saving the
// same name is a no-op rather than a false collision.
export async function makeUniqueEstablishmentSlug(
  service: ServiceClient,
  name: string,
  excludeId?: string,
): Promise<string> {
  const base = slugifyEstablishmentName(name) || 'salon';
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate =
      attempt === 0 ? base : `${base.slice(0, 72)}-${Math.random().toString(36).slice(2, 8)}`;
    let query = service
      .from('establishments')
      .select('id')
      .eq('slug', candidate)
      .limit(1);
    if (excludeId) query = query.neq('id', excludeId);
    const { data } = await query.maybeSingle();
    if (!data) return candidate;
  }
  // Extremely unlikely fallback: guaranteed-unique slug.
  return `${base.slice(0, 60)}-${Date.now().toString(36)}`;
}
