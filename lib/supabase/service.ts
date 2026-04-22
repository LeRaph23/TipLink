import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Bypasses ALL RLS — only for: webhook handlers, server-side admin ops.
// NEVER expose this key to the browser or include in client bundles.
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
