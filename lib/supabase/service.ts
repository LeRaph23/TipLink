import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { serverEnv, publicEnv } from '@/lib/env';

// Bypasses ALL RLS — only for: webhook handlers, server-side admin ops.
// NEVER expose this key to the browser or include in client bundles.
export function createServiceClient() {
  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
