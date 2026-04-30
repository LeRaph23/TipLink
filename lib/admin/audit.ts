'use server';

import type { Json } from '@/types/database';
import { createClient } from '@/lib/supabase/server';

/** Best-effort audit row; never throws to callers. */
export async function logAdminAction(action: string, metadata?: Record<string, unknown>) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
    if (!(roles ?? []).some((r) => r.role === 'super_admin')) return;
    await supabase.from('admin_audit_log').insert({
      actor_user_id: user.id,
      action,
      metadata: (metadata ?? {}) as Json,
    });
  } catch {
    /* ignore */
  }
}
